import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Client,
  type ModalSubmitInteraction,
} from "discord.js";

import { sendDirectMessage } from "../../lib/discord";
import { OrderStatus } from "../../lib/db-types";
import { prisma } from "../../lib/db";
import { formatRupiah } from "../../lib/money";
import { buildInstructionLines, readPaymentInstruction } from "../../lib/paymenku-instruction";
import { getAllSettings } from "../../lib/settings";
import { checkOrderPaymentStatus } from "../../services/paymentService";
import { createOrder } from "../../services/orderService";
import { getProductById } from "../../services/productService";

const MAX_ORDER_QTY = 100;
const ORDER_COOLDOWN_MS = 20_000;
const orderCooldowns = new Map<string, number>();
// ponytail: in-memory, hilang saat restart; upgrade ke tabel SQLite kalau spam jadi nyata.

function clampQuantity(raw: number, maxQty: number): number | null {
  const n = Math.trunc(raw);
  if (!Number.isFinite(n) || n < 1) {
    return null;
  }
  const cap = Math.min(MAX_ORDER_QTY, maxQty);
  return cap >= 1 && n <= cap ? n : null;
}

function consumeOrderCooldown(platform: string, userId: string): boolean {
  const key = `${platform}:${userId}`;
  const now = Date.now();
  const until = orderCooldowns.get(key);

  if (until && until > now) {
    return false;
  }

  orderCooldowns.set(key, now + ORDER_COOLDOWN_MS);
  return true;
}

export function registerInteractionHandler(client: Client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton()) {
      if (interaction.customId.startsWith("buy:")) {
        await handleBuyInteraction(interaction);
        return;
      }

      if (interaction.customId.startsWith("checkpay:")) {
        await handleCheckPaymentInteraction(interaction);
      }

      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("buyqty:")) {
        await handleBuyQuantitySubmit(interaction);
      }
    }
  });
}

async function handleBuyInteraction(interaction: ButtonInteraction) {
  const productId = interaction.customId.slice(4);
  const settings = await getAllSettings();
  const product = await getProductById(productId);

  if (!product || !product.isActive) {
    await interaction.reply({
      content: "Produk ini sudah tidak aktif atau tidak ditemukan.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (product.type === "STOCK_LINE" && product.availableStockCount <= 0) {
    await interaction.reply({
      content: settings.text.warningStockEmpty,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`buyqty:${product.id}`)
    .setTitle(`Buy ${product.name}`);

  const quantityInput = new TextInputBuilder()
    .setCustomId("quantity")
    .setLabel("Jumlah pembelian")
    .setPlaceholder("Contoh: 1 atau 3")
    .setRequired(true)
    .setStyle(TextInputStyle.Short)
    .setValue("1")
    .setMinLength(1)
    .setMaxLength(3);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(quantityInput),
  );

  await interaction.showModal(modal);
}

async function handleBuyQuantitySubmit(interaction: ModalSubmitInteraction) {
  const productId = interaction.customId.slice("buyqty:".length);
  const quantityRaw = interaction.fields.getTextInputValue("quantity").trim();
  const quantity = Number.parseInt(quantityRaw, 10);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    await interaction.reply({
      content: "Jumlah pembelian harus angka bulat lebih dari 0.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const settings = await getAllSettings();
    const product = await getProductById(productId);

    if (!product || !product.isActive) {
      await interaction.editReply("Produk ini sudah tidak aktif atau tidak ditemukan.");
      return;
    }

    if (product.type === "STOCK_LINE" && product.availableStockCount <= 0) {
      await interaction.editReply(settings.text.warningStockEmpty);
      return;
    }

    const maxQty =
      product.type === "CUSTOM_TEXT"
        ? MAX_ORDER_QTY
        : Math.min(MAX_ORDER_QTY, product.availableStockCount);
    const qty = clampQuantity(quantity, maxQty);

    if (qty === null) {
      await interaction.editReply("Jumlah pembelian tidak valid.");
      return;
    }

    if (!consumeOrderCooldown("discord", interaction.user.id)) {
      await interaction.editReply("Tunggu sebentar sebelum membuat order lagi ya.");
      return;
    }

    try {
      await sendDirectMessage(interaction.client as Client<true>, interaction.user.id, {
        content: settings.text.dmTestText,
      });
    } catch {
      await interaction.editReply(settings.text.warningDmClosed);
      return;
    }

    const order = await createOrder({
      platform: "discord",
      customerId: interaction.user.id,
      customerName: interaction.user.username,
      productId,
      quantity: qty,
    });

    await sendInvoiceDm(interaction.client as Client<true>, interaction.user.id, order);
    await interaction.editReply("Invoice sudah dikirim ke DM kamu. Lanjutkan pembayaran QRIS.");
  } catch (error) {
    await interaction.editReply(
      error instanceof Error ? error.message : "Gagal membuat invoice order",
    );
  }
}

async function handleCheckPaymentInteraction(interaction: ButtonInteraction) {
  const orderId = interaction.customId.slice("checkpay:".length);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      await interaction.editReply("Order tidak ditemukan.");
      return;
    }

    if (order.discordUserId !== interaction.user.id) {
      await interaction.editReply("Order ini bukan milik kamu.");
      return;
    }

    const latest =
      order.status === OrderStatus.PENDING
        ? await checkOrderPaymentStatus(order.id)
        : order;

    await interaction.editReply(buildPaymentStatusMessage(latest.status));
  } catch (error) {
    await interaction.editReply(
      error instanceof Error ? error.message : "Gagal cek status payment.",
    );
  }
}

async function sendInvoiceDm(
  client: Client<true>,
  userId: string,
  order: Awaited<ReturnType<typeof createOrder>>,
) {
  const embed = new EmbedBuilder()
    .setTitle(`Invoice ${order.referenceId}`)
    .setDescription("Invoice berhasil dibuat. Lanjutkan pembayaran dari QRIS di bawah.")
    .addFields(
      { name: "Produk", value: order.product.name, inline: true },
      { name: "Qty", value: String(order.quantity), inline: true },
      {
        name: "Total Bayar",
        value: formatRupiah(order.paymentAmount || order.subtotal),
        inline: true,
      },
      { name: "Status", value: "Pending", inline: true },
      {
        name: "Expired",
        value: formatDiscordDate(order.expiresAt),
        inline: true,
      },
    );

  if (order.paymenkuQrUrl) {
    embed.setImage(order.paymenkuQrUrl);
  }

  const instructionLines = buildInstructionLines(
    readPaymentInstruction(order.paymenkuRawJson),
    { includeQrUrl: false },
  );

  if (instructionLines.length > 0) {
    embed.addFields({
      name: "Instruksi Pembayaran",
      value: instructionLines.join("\n").slice(0, 1024),
      inline: false,
    });
  }

  const paymentButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Primary)
      .setCustomId(`checkpay:${order.id}`)
      .setLabel("Cek Payment Status"),
  );

  if (order.paymenkuPayUrl) {
    paymentButtons.addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setURL(order.paymenkuPayUrl)
        .setLabel("Buka Halaman Bayar"),
    );
  }

  await sendDirectMessage(client, userId, {
    embeds: [embed],
    components: [paymentButtons],
  });
}

function formatDiscordDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function buildPaymentStatusMessage(status: string) {
  switch (status) {
    case OrderStatus.PAID:
      return "Pembayaran sudah terverifikasi. Produk akan dikirim atau sudah dikirim via DM.";
    case OrderStatus.PENDING:
      return "Pembayaran masih pending. Coba lagi beberapa saat.";
    case OrderStatus.EXPIRED:
      return "Invoice sudah expired dan order dibatalkan otomatis.";
    case OrderStatus.CANCELLED:
      return "Order sudah dibatalkan.";
    case OrderStatus.FAILED:
      return "Pembayaran gagal.";
    case OrderStatus.REFUNDED:
      return "Pembayaran sudah direfund.";
    default:
      return `Status order saat ini: ${status}`;
  }
}
