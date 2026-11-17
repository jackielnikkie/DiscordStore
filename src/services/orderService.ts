import {
  OrderStatus,
  ProductType,
  type Order as PrismaOrder,
  type Product,
} from "../lib/db-types";
import { sendBuyAlert } from "../bot/services/buyAlert";
import { syncAutoOrderEmbed } from "../bot/services/embedSync";
import { sendCustomerMessage } from "../lib/notify";
import { formatRupiah, parseMoney } from "../lib/money";
import { parsePriceTiers, resolveOrderTotal } from "../lib/pricing";
import { createPaymenkuTransaction } from "../lib/paymenku";
import { getAllSettings, requestEmbedSync } from "../lib/settings";
import { renderTemplate } from "../lib/templates";
import { prisma } from "../lib/db";
import {
  getAvailableStockCount,
  markReservedStockSold,
  releaseReservedStock,
  reserveStock,
} from "./stockService";

type OrderInput = {
  platform?: "discord" | "telegram";
  customerId: string;
  customerName?: string;
  productId: string;
  quantity?: number;
};

type PaymentUpdatePayload = {
  trx_id?: string;
  reference_id?: string;
  status?: string;
  amount?: string | number;
  total_fee?: string | number;
  amount_received?: string | number;
  payment_channel?: string;
  paid_at?: string;
  is_sandbox?: boolean;
  rawJson?: string;
};

type OrderWithRelations = PrismaOrder & {
  product: Product;
  soldStocks: Array<{ content: string }>;
  reservedStocks: Array<{ content: string }>;
};

const ORDER_EXPIRY_MINUTES = 10;

export async function createOrder(input: OrderInput) {
  const quantity = input.quantity || 1;
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
  });

  if (!product || !product.isActive) {
    throw new Error("Produk tidak tersedia");
  }

  // Reuse invoice pending yang masih hidup supaya buyer tidak punya 2 QR aktif.
  const platform = input.platform || "discord";
  const existing = await prisma.order.findMany({
    where: {
      platform,
      discordUserId: input.customerId,
      productId: product.id,
      status: OrderStatus.PENDING,
    },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  const reusable = existing[0];

  if (
    reusable?.paymenkuPayUrl &&
    reusable.expiresAt &&
    new Date(reusable.expiresAt).getTime() > Date.now()
  ) {
    return prisma.order.findUnique({
      where: { id: reusable.id },
      include: { product: true, soldStocks: true, reservedStocks: true },
    });
  }

  if (product.type === ProductType.STOCK_LINE) {
    const availableStock = await getAvailableStockCount(product.id);

    if (availableStock < quantity) {
      throw new Error("Stok produk tidak cukup");
    }
  }

  const referenceId = createReferenceId();
  const { unitPrice, subtotal } = resolveOrderTotal(
    product.price,
    parsePriceTiers(product.bulkPriceJson),
    quantity,
  );
  const order = await prisma.order.create({
    data: {
      referenceId,
      platform,
      discordUserId: input.customerId,
      discordUsername: input.customerName || "",
      productId: product.id,
      quantity,
      unitPrice,
      subtotal,
      paymentChannel: "qris",
    },
  });

  try {
    if (product.type === ProductType.STOCK_LINE) {
      await reserveStock(product.id, quantity, order.id);
    }

    const payment = await createPaymenkuTransaction({
      amount: order.subtotal,
      referenceId: order.referenceId,
      customerName: input.customerName || input.customerId,
      customerEmail: `${input.platform || "discord"}-${input.customerId}@example.local`,
      idempotencyKey: `ORDER-${order.id}-${new Date().toISOString().slice(0, 10)}`,
    });
    const providerExpirationAt = parseExternalDate(
      payment.data.payment_info?.expiration_date,
    );
    const localExpirationAt = new Date(Date.now() + ORDER_EXPIRY_MINUTES * 60_000);
    const expirationAt =
      providerExpirationAt && providerExpirationAt.getTime() < localExpirationAt.getTime()
        ? providerExpirationAt
        : localExpirationAt;

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentAmount: parseMoney(payment.data.amount, order.subtotal),
        paymenkuTrxId: payment.data.trx_id,
        paymenkuPayUrl: payment.data.pay_url,
        paymenkuQrUrl: payment.data.payment_info?.qr_url || "",
        paymenkuQrString: payment.data.payment_info?.qr_string || "",
        paymenkuRawJson: JSON.stringify(payment),
        expiresAt: expirationAt,
        isSandbox: payment.mode === "sandbox",
      },
      include: {
        product: true,
        soldStocks: true,
        reservedStocks: true,
      },
    });

    await refreshStoreEmbed().catch(() => null);
    return updatedOrder;
  } catch (error) {
    await releaseReservedStock(order.id).catch(() => null);
    await refreshStoreEmbed().catch(() => null);
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.FAILED,
        paymenkuRawJson: JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      },
    });
    throw error;
  }
}

export async function markOrderPaid(
  referenceId: string,
  payload?: PaymentUpdatePayload,
) {
  const result = await prisma.$transaction(async (tx: typeof prisma) => {
    const order = await tx.order.findUnique({
      where: { referenceId },
      include: {
        product: true,
        soldStocks: { select: { content: true } },
        reservedStocks: { select: { content: true } },
      },
    });

    if (!order) {
      throw new Error("Order tidak ditemukan");
    }

    if (order.status === OrderStatus.PAID) {
      return { action: "already_paid" as const, order, underpaid: false };
    }

    if (order.status === OrderStatus.REFUNDED) {
      return { action: "ignored" as const, order, underpaid: false };
    }

    // Telat bayar (EXPIRED/CANCELLED/FAILED) tetap diterima: uang buyer sudah masuk.
    const paidAmount =
      payload?.amount !== undefined
        ? parseMoney(payload.amount, order.subtotal)
        : null;
    const underpaid = paidAmount !== null && paidAmount < order.subtotal;

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.PAID,
        paidAt: parseExternalDate(payload?.paid_at) || new Date(),
        paymenkuTrxId: payload?.trx_id || order.paymenkuTrxId,
        paymenkuRawJson: payload?.rawJson || order.paymenkuRawJson,
        deliveryError: underpaid
          ? `Pembayaran kurang: ${paidAmount} < ${order.subtotal}`
          : order.deliveryError,
        paymentAmount:
          payload?.amount !== undefined
            ? parseMoney(payload.amount, order.paymentAmount || order.subtotal)
            : order.paymentAmount,
        totalFee:
          payload?.total_fee !== undefined
            ? parseMoney(payload.total_fee)
            : order.totalFee,
        amountReceived:
          payload?.amount_received !== undefined
            ? parseMoney(payload.amount_received)
            : order.amountReceived,
        paymentChannel: payload?.payment_channel || order.paymentChannel,
        isSandbox:
          payload?.is_sandbox !== undefined ? payload.is_sandbox : order.isSandbox,
      },
    });

    await tx.product.update({
      where: { id: order.productId },
      data: {
        soldCount: {
          increment: order.quantity,
        },
      },
    });

    const updatedOrder = await tx.order.findUnique({
      where: { id: order.id },
      include: {
        product: true,
        soldStocks: { select: { content: true } },
        reservedStocks: { select: { content: true } },
      },
    });

    if (!updatedOrder) {
      throw new Error("Order tidak ditemukan setelah update");
    }

    return { action: "paid" as const, order: updatedOrder, underpaid };
  });

  if (result.action === "ignored") {
    return result.order;
  }

  if (result.action === "paid" && result.underpaid) {
    return result.order;
  }

  return deliverOrder(result.order.id);
}

export async function deliverOrder(orderId: string, options?: { force?: boolean }) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      product: true,
      soldStocks: { select: { content: true } },
      reservedStocks: { select: { content: true } },
    },
  });

  if (!order) {
    throw new Error("Order tidak ditemukan");
  }

  if (order.status !== OrderStatus.PAID) {
    throw new Error("Order belum dibayar");
  }

  if (order.deliveredAt && !options?.force) {
    return order;
  }

  // Docs Paymenku: transaksi sandbox tidak boleh memicu pemenuhan pesanan sungguhan,
  // kecuali admin menyalakan toggle uji coba.
  const settings = await getAllSettings();

  if (order.isSandbox && !settings.payment.allowSandboxDelivery) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        deliveryError: "Transaksi sandbox: delivery otomatis dilewati.",
      },
    });

    return order;
  }

  const stockLines = await ensureSoldStockLines(order);
  const message = renderTemplate(settings.text.dmPaymentSuccessText, {
    productName: order.product.name,
    quantity: order.quantity,
    price: formatRupiah(order.subtotal),
    paymentAmount: formatRupiah(order.paymentAmount || order.subtotal),
    payUrl: order.paymenkuPayUrl || "",
    qrUrl: order.paymenkuQrUrl || "",
    expirationDate: order.expiresAt || "",
    stockLines: stockLines.join("\n"),
    referenceId: order.referenceId,
    trxId: order.paymenkuTrxId || "",
  });

  const run = async () => {
    await sendCustomerMessage(order.platform, order.discordUserId, message);

    let updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        deliveredAt: order.deliveredAt || new Date().toISOString(),
        deliveryError: null,
      },
      include: {
        product: true,
        soldStocks: { select: { content: true } },
        reservedStocks: { select: { content: true } },
      },
    });

    if (!updated.buyAlertSentAt) {
      await sendBuyAlert({
        platform: updated.platform,
        customerId: updated.discordUserId,
        customerName: updated.discordUsername || updated.discordUserId,
        productName: updated.product.name,
        quantity: updated.quantity,
      }).catch(() => null);

      updated = await prisma.order.update({
        where: { id: updated.id },
        data: {
          buyAlertSentAt: new Date().toISOString(),
        },
        include: {
          product: true,
          soldStocks: { select: { content: true } },
          reservedStocks: { select: { content: true } },
        },
      });
    }

    await syncAutoOrderEmbed().catch(() => null);
    return updated;
  };

  try {
    return await run();
  } catch (error) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        deliveryError: error instanceof Error ? error.message : "Delivery gagal",
      },
    });
    throw error;
  }
}

export async function resendDelivery(orderId: string) {
  return deliverOrder(orderId, { force: true });
}

export async function expireOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
  });

  if (!order || order.status !== OrderStatus.PENDING) {
    return order;
  }

  await releaseReservedStock(order.id);
  const updatedOrder = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: OrderStatus.EXPIRED,
    },
  });

  await notifyOrderExpired(order).catch(() => null);
  await refreshStoreEmbed().catch(() => null);
  return updatedOrder;
}

export async function cancelOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
  });

  if (!order) {
    throw new Error("Order tidak ditemukan");
  }

  if (order.status === OrderStatus.PAID) {
    throw new Error("Order yang sudah dibayar tidak bisa dibatalkan manual");
  }

  await releaseReservedStock(order.id);
  const updatedOrder = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: OrderStatus.CANCELLED,
    },
  });

  await refreshStoreEmbed().catch(() => null);
  return updatedOrder;
}

export async function markOrderTerminalStatus(
  referenceId: string,
  status: OrderStatus.EXPIRED | OrderStatus.FAILED | OrderStatus.CANCELLED | OrderStatus.REFUNDED,
  payload?: PaymentUpdatePayload,
) {
  const order = await prisma.order.findUnique({
    where: { referenceId },
  });

  if (!order) {
    throw new Error("Order tidak ditemukan");
  }

  if (order.status === OrderStatus.PAID && status !== OrderStatus.REFUNDED) {
    return order;
  }

  await releaseReservedStock(order.id);

  if (status === OrderStatus.REFUNDED) {
    await restockSoldItems(order.id, order.productId, order.quantity);
  }

  const updatedOrder = await prisma.order.update({
    where: { id: order.id },
    data: {
      status,
      paymenkuRawJson: payload?.rawJson || order.paymenkuRawJson,
      paymenkuTrxId: payload?.trx_id || order.paymenkuTrxId,
    },
  });

  await refreshStoreEmbed().catch(() => null);
  return updatedOrder;
}

async function ensureSoldStockLines(order: OrderWithRelations) {
  if (order.product.type === ProductType.CUSTOM_TEXT) {
    return [
      order.product.customText || "Produk custom akan diproses manual oleh admin.",
    ];
  }

  if (order.soldStocks.length > 0) {
    return order.soldStocks.map((stock) => stock.content);
  }

  await markReservedStockSold(order.id);

  // Telat bayar setelah stok reserved dilepas: ambil ulang dari stok tersedia.
  let soldStocks = await findSoldStocks(order.id);

  if (soldStocks.length < order.quantity) {
    const shortage = order.quantity - soldStocks.length;
    await reserveStock(order.productId, shortage, order.id);
    await markReservedStockSold(order.id);
    soldStocks = await findSoldStocks(order.id);
  }

  if (soldStocks.length === 0) {
    throw new Error("Tidak ada stok yang bisa dikirim untuk order ini");
  }

  return soldStocks.map((stock) => stock.content);
}

async function findSoldStocks(orderId: string) {
  return prisma.stockItem.findMany({
    where: {
      soldOrderId: orderId,
    },
    select: {
      content: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

async function restockSoldItems(orderId: string, productId: string, quantity: number) {
  const sold = await prisma.stockItem.findMany({
    where: { soldOrderId: orderId, status: "SOLD" },
    orderBy: { createdAt: "asc" },
  });

  if (sold.length === 0) {
    return;
  }

  await prisma.stockItem.updateMany({
    where: { soldOrderId: orderId, status: "SOLD" },
    data: { status: "AVAILABLE", soldOrderId: null },
  });

  const product = await prisma.product.findUnique({ where: { id: productId } });
  await prisma.product.update({
    where: { id: productId },
    data: { soldCount: Math.max(0, Number(product?.soldCount ?? quantity) - sold.length) },
  });
}

function createReferenceId() {
  const date = new Date();
  const datePart = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(
    date.getDate(),
  ).padStart(2, "0")}`;
  const randomPart = Math.floor(Math.random() * 900000 + 100000);
  return `ORDER-${datePart}-${randomPart}`;
}

function parseExternalDate(value?: string | null) {
  const raw = value?.trim();

  if (!raw) {
    return null;
  }

  if (/^\d{10}$/.test(raw)) {
    return new Date(Number(raw) * 1000);
  }

  if (/^\d{13}$/.test(raw)) {
    return new Date(Number(raw));
  }

  if (/^\d{14}$/.test(raw)) {
    const year = Number(raw.slice(0, 4));
    const month = Number(raw.slice(4, 6));
    const day = Number(raw.slice(6, 8));
    const hour = Number(raw.slice(8, 10));
    const minute = Number(raw.slice(10, 12));
    const second = Number(raw.slice(12, 14));

    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  }

  const direct = Date.parse(raw);
  if (!Number.isNaN(direct)) {
    return new Date(direct);
  }

  const isoLike = raw.replace(" ", "T");
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(isoLike)
    ? isoLike
    : `${isoLike}Z`;
  const fallback = Date.parse(normalized);

  if (!Number.isNaN(fallback)) {
    return new Date(fallback);
  }

  return null;
}

async function refreshStoreEmbed() {
  try {
    await syncAutoOrderEmbed();
  } catch {
    await requestEmbedSync();
  }
}

async function notifyOrderExpired(order: PrismaOrder) {
  const settings = await getAllSettings();
  const message = renderTemplate(settings.text.dmExpiredText, {
    referenceId: order.referenceId,
  });

  await sendCustomerMessage(order.platform, order.discordUserId, message);
}
