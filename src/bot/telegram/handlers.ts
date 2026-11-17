import { OrderStatus } from "../../lib/db-types";
import { prisma } from "../../lib/db";
import { formatRupiah } from "../../lib/money";
import { parsePriceTiers } from "../../lib/pricing";
import { renderTemplate } from "../../lib/templates";
import { getAllSettings, getTelegramSettings, saveTelegramSettings } from "../../lib/settings";
import {
  answerCallbackQuery,
  buildQtyKeyboard,
  exportTelegramInviteLink,
  getTelegramChatMember,
  sendTelegramMessage,
  sendTelegramPhoto,
  type InlineKeyboard,
  type TelegramUpdate,
} from "../../lib/telegram";
import { checkOrderPaymentStatus } from "../../services/paymentService";
import { createOrder } from "../../services/orderService";
import { getProductById, listProductsWithStock } from "../../services/productService";
import { buildCatalogKeyboard, buildCatalogText } from "./catalog";

export async function handleTelegramUpdate(update: TelegramUpdate) {
  if (update.my_chat_member) {
    await handleMyChatMember(update.my_chat_member);
    return;
  }

  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }

  if (update.message?.text) {
    await handleMessage(update.message);
  }
}

async function handleMyChatMember(
  update: NonNullable<TelegramUpdate["my_chat_member"]>,
) {
  const isChannel = update.chat.type === "channel" || update.chat.type === "supergroup";
  const status = update.new_chat_member.status;

  if (!isChannel || !["member", "administrator", "creator"].includes(status)) {
    return;
  }

  await saveTelegramSettings({ telegramAdminChannelId: String(update.chat.id) });

  await sendTelegramMessage(
    update.chat.id,
    "Bot terhubung. Chat ini otomatis dipakai sebagai channel log store.",
  ).catch(() => null);
}

async function handleMessage(message: NonNullable<TelegramUpdate["message"]>) {
  const chatId = message.chat.id;
  const text = (message.text || "").trim();
  const command = text.split(/\s+/)[0];

  if (command === "/start") {
    const payload = text.split(/\s+/)[1] || "";

    if (!(await ensureJoined(chatId, message.from?.id || chatId))) {
      return;
    }

    if (payload.startsWith("buy_")) {
      await showProduct(chatId, payload.slice(4));
      return;
    }

    await showCatalog(chatId);
    return;
  }

  if (command === "/products" || command === "/menu") {
    if (!(await ensureJoined(chatId, message.from?.id || chatId))) {
      return;
    }

    await showCatalog(chatId);
    return;
  }

  if (command === "/history") {
    await showHistory(chatId);
    return;
  }

  await sendTelegramMessage(
    chatId,
    "Perintah tersedia:\n/products - daftar produk\n/history - riwayat order",
  );
}

async function showCatalog(chatId: number) {
  const [settings, products] = await Promise.all([
    getAllSettings(),
    listProductsWithStock(),
  ]);
  const active = products.filter((product) => product.isActive);

  if (active.length === 0) {
    await sendTelegramMessage(chatId, "Belum ada produk aktif.");
    return;
  }

  await sendTelegramMessage(
    chatId,
    buildCatalogText(active, settings.telegram.telegramCatalogTitle || settings.text.embedTitle),
    buildCatalogKeyboard(active),
  );
}

async function showProduct(chatId: number, productId: string) {
  const product = await getProductById(productId);

  if (!product || !product.isActive) {
    await sendTelegramMessage(chatId, "Produk ini sudah tidak aktif atau tidak ditemukan.");
    return;
  }

  if (product.type === "STOCK_LINE" && product.availableStockCount <= 0) {
    await sendTelegramMessage(chatId, "Stok produk ini sedang habis. Coba lagi nanti.");
    return;
  }

  const maxQty = product.type === "CUSTOM_TEXT" ? 10 : product.availableStockCount;
  const lines = [
    product.name,
    "",
    `Harga: ${formatRupiah(product.price)}`,
    product.type === "CUSTOM_TEXT" ? "Tipe: custom" : `Stok: ${product.availableStockCount}`,
  ];

  for (const tier of parsePriceTiers(product.bulkPriceJson)) {
    lines.push(`≥${tier.qty} akun: ${formatRupiah(tier.price)}/akun`);
  }

  if (product.description) {
    lines.push("", product.description);
  }

  if (product.formatLabel) {
    lines.push("", `Format: ${product.formatLabel}`);
  }

  lines.push("", "Pilih jumlah:");

  const keyboard = buildQtyKeyboard(product.id, maxQty);
  keyboard.push([{ text: "« Katalog", callback_data: "catalog" }]);

  await sendTelegramMessage(chatId, lines.join("\n"), keyboard);
}

async function showHistory(chatId: number) {
  const orders = await prisma.order.findMany({
    where: { platform: "telegram", discordUserId: String(chatId) },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (orders.length === 0) {
    await sendTelegramMessage(chatId, "Belum ada order.");
    return;
  }

  const lines = ["Riwayat order terakhir:", ""];

  for (const order of orders) {
    lines.push(
      `${order.referenceId} - ${order.status} - ${formatRupiah(order.paymentAmount || order.subtotal)}`,
    );
  }

  await sendTelegramMessage(chatId, lines.join("\n"));
}

async function handleCallback(callback: NonNullable<TelegramUpdate["callback_query"]>) {
  const chatId = callback.message?.chat.id;
  const data = callback.data || "";

  if (!chatId) {
    await answerCallbackQuery(callback.id).catch(() => null);
    return;
  }

  if (data === "rejoin") {
    await answerCallbackQuery(callback.id, "Mengecek membership...").catch(() => null);
    membershipCache.clear();

    if (await ensureJoined(chatId, callback.from.id)) {
      await showCatalog(chatId);
    }

    return;
  }

  if (data.startsWith("prod:")) {
    await answerCallbackQuery(callback.id).catch(() => null);

    if (!(await ensureJoined(chatId, callback.from.id))) {
      return;
    }

    await showProduct(chatId, data.slice("prod:".length));
    return;
  }

  if (data === "catalog") {
    await answerCallbackQuery(callback.id).catch(() => null);
    await showCatalog(chatId);
    return;
  }

  if (data.startsWith("qty:")) {
    const [, productId, qtyRaw] = data.split(":");
    await answerCallbackQuery(callback.id).catch(() => null);

    if (!(await ensureJoined(chatId, callback.from.id))) {
      return;
    }

    await createTelegramOrder(chatId, callback.from, productId, Number(qtyRaw));
    return;
  }

  if (data.startsWith("checkpay:")) {
    await answerCallbackQuery(callback.id, "Mengecek status...").catch(() => null);
    await replyPaymentStatus(chatId, callback.from.id, data.slice("checkpay:".length));
    return;
  }

  await answerCallbackQuery(callback.id).catch(() => null);
}

async function createTelegramOrder(
  chatId: number,
  from: { id: number; username?: string; first_name?: string },
  productId: string,
  quantity: number,
) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    await sendTelegramMessage(chatId, "Jumlah pembelian tidak valid.");
    return;
  }

  try {
    const order = await createOrder({
      platform: "telegram",
      customerId: String(from.id),
      customerName: from.username || from.first_name || String(from.id),
      productId,
      quantity,
    });

    const settings = await getAllSettings();
    const caption = renderTemplate(settings.text.dmInvoiceText, {
      productName: order.product.name,
      quantity: order.quantity,
      paymentAmount: formatRupiah(order.paymentAmount || order.subtotal),
      payUrl: order.paymenkuPayUrl || "-",
      qrUrl: order.paymenkuQrUrl || "-",
      expirationDate: order.expiresAt || "-",
      referenceId: order.referenceId,
    }).slice(0, 1024);

    const keyboard: InlineKeyboard = [
      [{ text: "Cek Payment Status", callback_data: `checkpay:${order.id}` }],
    ];

    if (order.paymenkuPayUrl) {
      keyboard.unshift([{ text: "Buka Halaman Bayar", url: order.paymenkuPayUrl }]);
    }

    if (order.paymenkuQrUrl) {
      await sendTelegramPhoto(chatId, order.paymenkuQrUrl, caption, keyboard);
      return;
    }

    await sendTelegramMessage(chatId, caption, keyboard);
  } catch (error) {
    await sendTelegramMessage(
      chatId,
      error instanceof Error ? error.message : "Gagal membuat invoice order",
    );
  }
}

async function replyPaymentStatus(chatId: number, telegramUserId: number, orderId: string) {
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order || order.discordUserId !== String(telegramUserId)) {
      await sendTelegramMessage(chatId, "Order ini bukan milik kamu.");
      return;
    }

    const latest =
      order.status === OrderStatus.PENDING
        ? await checkOrderPaymentStatus(order.id)
        : order;

    await sendTelegramMessage(chatId, describeStatus(latest.status));
  } catch (error) {
    await sendTelegramMessage(
      chatId,
      error instanceof Error ? error.message : "Gagal cek status payment.",
    );
  }
}

function describeStatus(status: string) {
  switch (status) {
    case OrderStatus.PAID:
      return "Pembayaran terverifikasi. Produk dikirim via chat ini.";
    case OrderStatus.PENDING:
      return "Pembayaran masih pending. Coba lagi beberapa saat.";
    case OrderStatus.EXPIRED:
      return "Invoice sudah expired.";
    case OrderStatus.CANCELLED:
      return "Order sudah dibatalkan.";
    case OrderStatus.FAILED:
      return "Pembayaran gagal.";
    case OrderStatus.REFUNDED:
      return "Pembayaran sudah direfund.";
    default:
      return `Status order: ${status}`;
  }
}

const MEMBERSHIP_TTL_MS = 5 * 60 * 1000;
const membershipCache = new Map<string, number>();
const inviteLinkCache = new Map<string, string>();

/** Gate join channel: true kalau boleh lanjut ke katalog. */
async function ensureJoined(chatId: number, userId: number) {
  const settings = await getTelegramSettings();

  if (
    !settings.telegramForceJoinEnabled ||
    !settings.telegramForceJoinChannel ||
    !settings.telegramBotToken
  ) {
    return true;
  }

  const channel = settings.telegramForceJoinChannel;
  const key = `${channel}:${userId}`;
  const cachedUntil = membershipCache.get(key);

  if (cachedUntil && cachedUntil > Date.now()) {
    return true;
  }

  try {
    const member = await getTelegramChatMember(
      channel,
      userId,
      settings.telegramBotToken,
    );

    if (["creator", "administrator", "member"].includes(member.status)) {
      membershipCache.set(key, Date.now() + MEMBERSHIP_TTL_MS);
      return true;
    }
  } catch (error) {
    console.error(
      "[telegram] cek membership gagal",
      error instanceof Error ? error.message : error,
    );

    // Fail-open: salah konfigurasi channel jangan sampai memblokir penjualan.
    return true;
  }

  await sendJoinPrompt(chatId, channel, settings.telegramBotToken);
  return false;
}

async function sendJoinPrompt(chatId: number, channel: string, token: string) {
  const url = await resolveChannelUrl(channel, token);

  await sendTelegramMessage(
    chatId,
    "Sebelum masuk katalog, join channel kami dulu ya.\n\nSetelah join, tekan tombol «Sudah join, cek ulang».",
    [
      [{ text: "Join Channel", url }],
      [{ text: "Sudah join, cek ulang", callback_data: "rejoin" }],
    ],
  ).catch(() => null);
}

async function resolveChannelUrl(channel: string, token: string) {
  const trimmed = channel.trim();

  if (trimmed.startsWith("@")) {
    return `https://t.me/${trimmed.slice(1)}`;
  }

  if (/^https?:\/\//.test(trimmed)) {
    return trimmed;
  }

  const cached = inviteLinkCache.get(trimmed);

  if (cached) {
    return cached;
  }

  try {
    const link = await exportTelegramInviteLink(trimmed, token);
    inviteLinkCache.set(trimmed, link);
    return link;
  } catch {
    return `https://t.me/${trimmed}`;
  }
}
