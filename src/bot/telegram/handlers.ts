import { OrderStatus } from "../../lib/db-types";
import { prisma } from "../../lib/db";
import { formatRupiah } from "../../lib/money";
import { buildInstructionLines, readPaymentInstruction } from "../../lib/paymenku-instruction";
import { parsePriceTiers } from "../../lib/pricing";
import { escapeHtml } from "../../lib/delivery-format";
import { renderTemplate } from "../../lib/templates";
import { getAllSettings, getTelegramSettings, saveTelegramSettings } from "../../lib/settings";
import {
  answerCallbackQuery,
  buildQtyKeyboard,
  deleteTelegramMessage,
  exportTelegramInviteLink,
  getTelegramChatMember,
  isChannelAdminStatus,
  parseRequiredChannels,
  sendTelegramMessage,
  sendTelegramPhoto,
  type InlineKeyboard,
  type TelegramUpdate,
} from "../../lib/telegram";
import { checkOrderPaymentStatus } from "../../services/paymentService";
import { createOrder, deliverOrder } from "../../services/orderService";
import { getProductById, listProductsWithStock } from "../../services/productService";
import { buildCatalogKeyboard, buildCatalogText } from "./catalog";

export async function handleTelegramUpdate(update: TelegramUpdate) {
  if (update.my_chat_member) {
    await handleMyChatMember(update.my_chat_member);
    return;
  }

  if (update.channel_post) {
    await handleChannelPost(update.channel_post);
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

  const settings = await getTelegramSettings();
  const current = settings.telegramAdminChannelId;
  const detected = String(update.chat.id);

  if (settings.telegramAdminChannelLocked) {
    await sendTelegramMessage(
      update.chat.id,
      `Bot terhubung. Channel log terkunci ke ${current} — ubah lewat panel admin kalau perlu.`,
    ).catch(() => null);
    return;
  }

  // Jangan pernah menimpa channel log yang sudah diatur admin.
  if (current) {
    await sendTelegramMessage(
      update.chat.id,
      current === detected
        ? "Bot terhubung. Channel ini dipakai sebagai channel log store."
        : `Bot terhubung. Channel log store tetap yang sudah diatur (${current}). Kalau mau pakai channel ini, tekan tombol di bawah — hanya admin channel yang bisa mengubah.`,
      [
        [
          {
            text: "Pakai channel ini sebagai log",
            callback_data: `setlog:${detected}`,
          },
        ],
      ],
    ).catch(() => null);
    return;
  }

  await saveTelegramSettings({ telegramAdminChannelId: detected });

  await sendTelegramMessage(
    update.chat.id,
    "Bot terhubung. Chat ini dipakai sebagai channel log store.",
  ).catch(() => null);
}

async function handleChannelPost(post: NonNullable<TelegramUpdate["channel_post"]>) {
  const command = (post.text || "").trim().split(/\s+/)[0].split("@")[0];

  if (command !== "/setlog") {
    return;
  }

  const chatId = post.chat.id;
  const settings = await getTelegramSettings();

  try {
    if (!post.from?.id) {
      return;
    }

    const member = await getTelegramChatMember(
      chatId,
      post.from.id,
      settings.telegramBotToken,
    );

    if (!isChannelAdminStatus(member.status)) {
      await sendTelegramMessage(
        chatId,
        "Hanya admin channel yang bisa mengunci channel log.",
      ).catch(() => null);
      return;
    }

    await saveTelegramSettings({
      telegramAdminChannelId: String(chatId),
      telegramAdminChannelLocked: true,
    });

    await sendTelegramMessage(
      chatId,
      "Channel log dikunci ke channel ini. Buy alert akan masuk ke sini. Untuk mengubah, buka panel admin → Settings → Telegram.",
    ).catch(() => null);
  } catch {
    await sendTelegramMessage(chatId, "Gagal memverifikasi admin channel.").catch(
      () => null,
    );
  } finally {
    await deleteTelegramMessage(chatId, post.message_id, settings.telegramBotToken).catch(
      () => null,
    );
  }
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
    buildCatalogText(
      active,
      settings.telegram.telegramCatalogTitle || settings.text.embedTitle,
      settings.bot.ownerDiscord,
    ),
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

  if (data.startsWith("setlog:")) {
    const channelId = data.slice("setlog:".length);
    const settings = await getTelegramSettings();

    if (settings.telegramAdminChannelLocked) {
      await answerCallbackQuery(
        callback.id,
        "Channel log terkunci. Ubah lewat panel admin.",
      ).catch(() => null);
      return;
    }

    try {
      const member = await getTelegramChatMember(
        channelId,
        callback.from.id,
        settings.telegramBotToken,
      );

      if (!isChannelAdminStatus(member.status)) {
        await answerCallbackQuery(
          callback.id,
          "Hanya admin channel yang bisa mengubah channel log.",
        ).catch(() => null);
        return;
      }

      await saveTelegramSettings({
        telegramAdminChannelId: channelId,
        telegramAdminChannelLocked: true,
      });
      await answerCallbackQuery(callback.id, "Channel log diperbarui & dikunci.").catch(
        () => null,
      );
      await sendTelegramMessage(
        chatId,
        "Channel log store sekarang memakai channel ini (terkunci). Buy alert akan masuk ke sini.",
      ).catch(() => null);
    } catch {
      await answerCallbackQuery(callback.id, "Gagal memverifikasi admin channel.").catch(
        () => null,
      );
    }

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

async function createTelegramOrder(
  chatId: number,
  from: { id: number; username?: string; first_name?: string },
  productId: string,
  quantity: number,
) {
  const product = await getProductById(productId);

  if (!product || !product.isActive) {
    await sendTelegramMessage(chatId, "Produk ini sudah tidak aktif atau tidak ditemukan.");
    return;
  }

  const maxQty =
    product.type === "CUSTOM_TEXT"
      ? MAX_ORDER_QTY
      : Math.min(MAX_ORDER_QTY, product.availableStockCount);
  const qty = clampQuantity(quantity, maxQty);

  if (qty === null) {
    await sendTelegramMessage(chatId, "Jumlah pembelian tidak valid.");
    return;
  }

  if (!consumeOrderCooldown("telegram", String(from.id))) {
    await sendTelegramMessage(chatId, "Tunggu sebentar sebelum membuat order lagi ya.");
    return;
  }

  try {
    const order = await createOrder({
      platform: "telegram",
      customerId: String(from.id),
      customerName: from.username || from.first_name || String(from.id),
      productId,
      quantity: qty,
    });

    const instruction = readPaymentInstruction(order.paymenkuRawJson);
    const settings = await getAllSettings();
    const body = buildInvoiceCaption(order, instruction, settings.text.dmInvoiceText);

    const keyboard: InlineKeyboard = [
      [{ text: "Cek Payment Status", callback_data: `checkpay:${order.id}` }],
    ];

    if (order.paymenkuPayUrl) {
      keyboard.unshift([{ text: "Buka Halaman Bayar", url: order.paymenkuPayUrl }]);
    }

    if (order.paymenkuQrUrl) {
      const sent = await sendTelegramPhoto(
        chatId,
        order.paymenkuQrUrl,
        body,
        keyboard,
        undefined,
        "HTML",
      );
      await rememberInvoiceMessage(order.id, sent.message_id);
      return;
    }

    const sent = await sendTelegramMessage(chatId, body, keyboard, undefined, "HTML");
    await rememberInvoiceMessage(order.id, sent.message_id);
  } catch (error) {
    await sendTelegramMessage(
      chatId,
      error instanceof Error ? error.message : "Gagal membuat invoice order",
    );
  }
}

// Simpan id pesan invoice supaya bisa dihapus saat pembayaran sukses.
async function rememberInvoiceMessage(orderId: string, messageId: number) {
  await prisma.order
    .update({ where: { id: orderId }, data: { invoiceMessageId: String(messageId) } })
    .catch(() => null);
}

function buildInvoiceCaption(
  order: Awaited<ReturnType<typeof createOrder>>,
  instruction: ReturnType<typeof readPaymentInstruction>,
  template: string,
) {
  const header = escapeHtml(
    renderTemplate(template, {
      referenceId: order.referenceId,
      productName: order.product.name,
      quantity: order.quantity,
      paymentAmount: formatRupiah(order.paymentAmount || order.subtotal),
      expirationDate: formatLocalDate(order.expiresAt),
      payUrl: order.paymenkuPayUrl || "-",
      qrUrl: order.paymenkuQrUrl || "-",
    }),
  );

  const lines = [header];

  const instructionLines = buildInstructionLines(instruction, {
    includeQrUrl: false,
    codeFormat: "html",
  });

  if (instructionLines.length > 0) {
    lines.push("", ...instructionLines);
  }

  return lines.join("\n").slice(0, 1024);
}

function formatLocalDate(value?: string | null) {
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
    timeZone: "Asia/Jakarta",
  }).format(parsed);
}

async function replyPaymentStatus(chatId: number, telegramUserId: number, orderId: string) {
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order || order.discordUserId !== String(telegramUserId)) {
      await sendTelegramMessage(chatId, "Order ini bukan milik kamu.");
      return;
    }

    if (order.status === OrderStatus.PENDING) {
      await checkOrderPaymentStatus(order.id).catch(() => null);
    }

    let latest = await prisma.order.findUnique({ where: { id: orderId } });

    // Self-heal: pembayaran sudah masuk tapi delivery belum sempat jalan.
    if (
      latest?.status === OrderStatus.PAID &&
      !latest.deliveredAt &&
      !latest.deliveryError
    ) {
      await deliverOrder(latest.id).catch(() => null);
      latest = (await prisma.order.findUnique({ where: { id: orderId } })) ?? latest;
    }

    await sendTelegramMessage(chatId, describeOrderState(latest), undefined, undefined, "HTML");
  } catch (error) {
    await sendTelegramMessage(
      chatId,
      error instanceof Error ? error.message : "Gagal cek status payment.",
    );
  }
}

function describeOrderState(order: {
  status: string;
  isSandbox?: boolean | null;
  deliveredAt?: string | null;
  deliveryError?: string | null;
}) {
  if (order.status === OrderStatus.PAID) {
    if (order.deliveredAt) {
      return "Pembayaran terverifikasi. Produk sudah dikirim di chat ini.";
    }

    if (order.deliveryError) {
      return [
        "Pembayaran terverifikasi, tapi pengiriman otomatis belum berhasil:",
        `<code>${escapeHtml(order.deliveryError)}</code>`,
        "",
        "Admin akan memproses manual. Simpan nomor invoice kamu.",
      ].join("\n");
    }

    return order.isSandbox
      ? "Pembayaran sandbox terverifikasi. Delivery otomatis dilewati di mode sandbox."
      : "Pembayaran terverifikasi. Produk sedang disiapkan, tunggu beberapa saat.";
  }

  return describeStatus(order.status);
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

function checkStatusAllowsAccess(status: string) {
  return ["creator", "administrator", "member"].includes(status);
}

/** Gate join channel: true kalau boleh lanjut ke katalog. */
async function ensureJoined(chatId: number, userId: number) {
  const settings = await getTelegramSettings();
  const channels = parseRequiredChannels(settings.telegramForceJoinChannel);

  if (
    !settings.telegramForceJoinEnabled ||
    channels.length === 0 ||
    !settings.telegramBotToken
  ) {
    return true;
  }

  const missing: string[] = [];

  for (const channel of channels) {
    const key = `${channel}:${userId}`;
    const cachedUntil = membershipCache.get(key);

    if (cachedUntil && cachedUntil > Date.now()) {
      continue;
    }

    try {
      const member = await getTelegramChatMember(
        channel,
        userId,
        settings.telegramBotToken,
      );

      if (checkStatusAllowsAccess(member.status)) {
        membershipCache.set(key, Date.now() + MEMBERSHIP_TTL_MS);
        continue;
      }

      missing.push(channel);
    } catch (error) {
      console.error(
        `[telegram] cek membership ${channel} gagal`,
        error instanceof Error ? error.message : error,
      );
      // Fail-open: salah konfigurasi channel jangan sampai memblokir penjualan.
    }
  }

  if (missing.length === 0) {
    return true;
  }

  await sendJoinPrompt(chatId, missing, settings.telegramBotToken);
  return false;
}

async function sendJoinPrompt(chatId: number, channels: string[], token: string) {
  const rows: InlineKeyboard = [];

  for (const channel of channels) {
    const url = await resolveChannelUrl(channel, token);
    rows.push([{ text: `Join ${channel}`, url }]);
  }

  rows.push([{ text: "Sudah join, cek ulang", callback_data: "rejoin" }]);

  const list = channels.length > 1 ? `(${channels.length} channel)` : "";

  await sendTelegramMessage(
    chatId,
    `Sebelum masuk katalog, join channel kami dulu ya ${list}.\n\nSetelah join, tekan tombol «Sudah join, cek ulang».`,
    rows,
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
