import { prisma } from "./db";

export type BotSettings = {
  discordBotToken: string;
  discordClientId: string;
  discordGuildId: string;
  autoOrderChannelId: string;
  buyAlertChannelId: string;
  adminRoleId: string;
  enableBuyAlert: boolean;
  enableAutoSyncEmbed: boolean;
  autoOrderMessageId: string;
  embedSyncRequestedAt: string;
  botReadyState: string;
  botLastHeartbeatAt: string;
};

export type PaymentSettings = {
  paymenkuApiKey: string;
  paymenkuWebhookSecret: string;
  paymenkuChannelCode: string;
  returnUrl: string;
};

export type TextSettings = {
  dmTestText: string;
  dmInvoiceText: string;
  dmPaymentSuccessText: string;
  dmExpiredText: string;
  dmFailedText: string;
  warningDmClosed: string;
  warningStockEmpty: string;
  buyAlertTemplate: string;
  embedTitle: string;
  embedDescription: string;
  embedFooter: string;
};

export type TelegramSettings = {
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramAdminChannelId: string;
  telegramCatalogTitle: string;
  telegramForceJoinEnabled: boolean;
  telegramForceJoinChannel: string;
  telegramBotUsername: string;
  telegramReadyState: string;
  telegramLastHeartbeatAt: string;
};

export type AppSettings = {
  bot: BotSettings;
  payment: PaymentSettings;
  text: TextSettings;
  telegram: TelegramSettings;
};

const botDefaults: BotSettings = {
  discordBotToken: process.env.DISCORD_BOT_TOKEN || "",
  discordClientId: process.env.DISCORD_CLIENT_ID || "",
  discordGuildId: process.env.DISCORD_GUILD_ID || "",
  autoOrderChannelId: "",
  buyAlertChannelId: "",
  adminRoleId: "",
  enableBuyAlert: true,
  enableAutoSyncEmbed: true,
  autoOrderMessageId: "",
  embedSyncRequestedAt: "",
  botReadyState: "offline",
  botLastHeartbeatAt: "",
};

const paymentDefaults: PaymentSettings = {
  paymenkuApiKey: process.env.PAYMENKU_API_KEY || "",
  paymenkuWebhookSecret: process.env.PAYMENKU_WEBHOOK_SECRET || "",
  paymenkuChannelCode: "qris",
  returnUrl: process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/order/success`
    : "http://localhost:3000/order/success",
};

const legacyBuyAlertTemplate = "@{{username}} Membeli {{quantity}} {{productName}} akun";
const defaultBuyAlertTemplate = "{{user}} Membeli {{quantity}} {{productName}} akun";

const textDefaults: TextSettings = {
  dmTestText:
    "Test DM dari bot. Ini untuk memastikan kamu bisa menerima invoice dan produk otomatis.",
  dmInvoiceText: [
    "Invoice berhasil dibuat.",
    "",
    "Produk: {{productName}}",
    "Qty: {{quantity}}",
    "Total bayar: {{paymentAmount}}",
    "Status: Pending",
    "",
    "Bayar via QRIS:",
    "{{payUrl}}",
    "",
    "QR Image:",
    "{{qrUrl}}",
    "",
    "Invoice expired: {{expirationDate}}",
  ].join("\n"),
  dmPaymentSuccessText: [
    "Pembayaran berhasil.",
    "",
    "Produk: {{productName}}",
    "Qty: {{quantity}}",
    "",
    "Data akun/API key kamu:",
    "{{stockLines}}",
    "",
    "Simpan data ini baik-baik.",
  ].join("\n"),
  dmExpiredText:
    "Pembayaran untuk order {{referenceId}} sudah expired. Jika masih ingin membeli, klik Buy lagi.",
  dmFailedText:
    "Pembayaran untuk order {{referenceId}} gagal atau dibatalkan. Silakan coba lagi.",
  warningDmClosed:
    "Order dibatalkan. Aktifkan DM/private chat dari bot/server ini dulu, lalu klik Buy lagi.",
  warningStockEmpty: "Stok produk ini sedang habis. Coba lagi nanti.",
  buyAlertTemplate: defaultBuyAlertTemplate,
  embedTitle: "Toko Akun Digital",
  embedDescription:
    "Pembayaran otomatis via QRIS. Akun dikirim lewat DM.\nPastikan akun Discord kamu bisa menerima DM.",
  embedFooter: "LapakLoka-MultiBotStore • Auto order",
};

const telegramDefaults: TelegramSettings = {
  telegramEnabled: false,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramAdminChannelId: "",
  telegramCatalogTitle: "",
  telegramForceJoinEnabled: false,
  telegramForceJoinChannel: "",
  telegramBotUsername: "",
  telegramReadyState: "offline",
  telegramLastHeartbeatAt: "",
};

const botKeys = Object.keys(botDefaults) as (keyof BotSettings)[];
const paymentKeys = Object.keys(paymentDefaults) as (keyof PaymentSettings)[];
const textKeys = Object.keys(textDefaults) as (keyof TextSettings)[];
const telegramKeys = Object.keys(telegramDefaults) as (keyof TelegramSettings)[];

export async function getAllSettings(): Promise<AppSettings> {
  const rows = await prisma.setting.findMany();
  const map = new Map<string, string>(rows.map((row: { key: string; value: string }) => [row.key, row.value as string]));

  return {
    bot: {
      ...botDefaults,
      discordBotToken: map.get("discordBotToken") || botDefaults.discordBotToken,
      discordClientId: map.get("discordClientId") || botDefaults.discordClientId,
      discordGuildId: map.get("discordGuildId") || botDefaults.discordGuildId,
      autoOrderChannelId:
        map.get("autoOrderChannelId") || botDefaults.autoOrderChannelId,
      buyAlertChannelId:
        map.get("buyAlertChannelId") || botDefaults.buyAlertChannelId,
      adminRoleId: map.get("adminRoleId") || botDefaults.adminRoleId,
      enableBuyAlert: parseBoolean(
        map.get("enableBuyAlert"),
        botDefaults.enableBuyAlert,
      ),
      enableAutoSyncEmbed: parseBoolean(
        map.get("enableAutoSyncEmbed"),
        botDefaults.enableAutoSyncEmbed,
      ),
      autoOrderMessageId:
        map.get("autoOrderMessageId") || botDefaults.autoOrderMessageId,
      embedSyncRequestedAt:
        map.get("embedSyncRequestedAt") || botDefaults.embedSyncRequestedAt,
      botReadyState: map.get("botReadyState") || botDefaults.botReadyState,
      botLastHeartbeatAt:
        map.get("botLastHeartbeatAt") || botDefaults.botLastHeartbeatAt,
    },
    payment: {
      ...paymentDefaults,
      paymenkuApiKey: map.get("paymenkuApiKey") || paymentDefaults.paymenkuApiKey,
      paymenkuWebhookSecret:
        map.get("paymenkuWebhookSecret") || paymentDefaults.paymenkuWebhookSecret,
      paymenkuChannelCode:
        map.get("paymenkuChannelCode") || paymentDefaults.paymenkuChannelCode,
      returnUrl: map.get("returnUrl") || paymentDefaults.returnUrl,
    },
    text: {
      ...textDefaults,
      dmTestText: map.get("dmTestText") || textDefaults.dmTestText,
      dmInvoiceText: map.get("dmInvoiceText") || textDefaults.dmInvoiceText,
      dmPaymentSuccessText:
        map.get("dmPaymentSuccessText") || textDefaults.dmPaymentSuccessText,
      dmExpiredText: map.get("dmExpiredText") || textDefaults.dmExpiredText,
      dmFailedText: map.get("dmFailedText") || textDefaults.dmFailedText,
      warningDmClosed:
        map.get("warningDmClosed") || textDefaults.warningDmClosed,
      warningStockEmpty:
        map.get("warningStockEmpty") || textDefaults.warningStockEmpty,
      buyAlertTemplate:
        normalizeBuyAlertTemplate(map.get("buyAlertTemplate")) ||
        textDefaults.buyAlertTemplate,
      embedTitle: map.get("embedTitle") || textDefaults.embedTitle,
      embedDescription:
        map.get("embedDescription") || textDefaults.embedDescription,
      embedFooter: map.get("embedFooter") || textDefaults.embedFooter,
    },
    telegram: {
      ...telegramDefaults,
      telegramEnabled: parseBoolean(
        map.get("telegramEnabled"),
        telegramDefaults.telegramEnabled,
      ),
      telegramBotToken:
        map.get("telegramBotToken") || telegramDefaults.telegramBotToken,
      telegramAdminChannelId:
        map.get("telegramAdminChannelId") || telegramDefaults.telegramAdminChannelId,
      telegramCatalogTitle:
        map.get("telegramCatalogTitle") || telegramDefaults.telegramCatalogTitle,
      telegramForceJoinEnabled: parseBoolean(
        map.get("telegramForceJoinEnabled"),
        telegramDefaults.telegramForceJoinEnabled,
      ),
      telegramForceJoinChannel:
        map.get("telegramForceJoinChannel") || telegramDefaults.telegramForceJoinChannel,
      telegramBotUsername:
        map.get("telegramBotUsername") || telegramDefaults.telegramBotUsername,
      telegramReadyState:
        map.get("telegramReadyState") || telegramDefaults.telegramReadyState,
      telegramLastHeartbeatAt:
        map.get("telegramLastHeartbeatAt") || telegramDefaults.telegramLastHeartbeatAt,
    },
  };
}

export async function getBotSettings() {
  return (await getAllSettings()).bot;
}

export async function getPaymentSettings() {
  return (await getAllSettings()).payment;
}

export async function getTextSettings() {
  return (await getAllSettings()).text;
}

export async function getTelegramSettings() {
  return (await getAllSettings()).telegram;
}

export async function saveSettings(
  input: Partial<BotSettings & PaymentSettings & TextSettings & TelegramSettings>,
) {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);

  await prisma.$transaction(async (tx: typeof prisma) => {
    for (const [key, value] of entries) {
      await tx.setting.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      });
    }
  });
}

export async function saveBotSettings(
  input: Partial<BotSettings>,
  options?: { preserveSecrets?: boolean },
) {
  const current = await getBotSettings();

  await saveSettings({
    ...normalizePartialSettings(current, input, options),
  });
}

export async function savePaymentSettings(
  input: Partial<PaymentSettings>,
  options?: { preserveSecrets?: boolean },
) {
  const current = await getPaymentSettings();

  await saveSettings({
    ...normalizePartialSettings(current, input, options),
  });
}

export async function saveTextSettings(input: Partial<TextSettings>) {
  await saveSettings(input);
}

export async function saveTelegramSettings(
  input: Partial<TelegramSettings>,
  options?: { preserveSecrets?: boolean },
) {
  const current = await getTelegramSettings();

  await saveSettings({
    ...normalizePartialSettings(current, input, options),
  });
}

export async function requestEmbedSync() {
  await saveSettings({
    embedSyncRequestedAt: new Date().toISOString(),
  });
}

export function detectPaymenkuMode(apiKey: string) {
  if (apiKey.startsWith("sk_test_")) {
    return "sandbox";
  }

  if (apiKey.startsWith("sk_live_")) {
    return "production";
  }

  return "unknown";
}

export function getWebhookUrl() {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/webhooks/paymenku`;
}

function normalizeBuyAlertTemplate(template?: string) {
  if (!template) {
    return "";
  }

  if (template === legacyBuyAlertTemplate) {
    return defaultBuyAlertTemplate;
  }

  return template.replace(/@\{\{\s*username\s*\}\}/g, "{{user}}");
}

export function maskSecret(value: string, visible = 4) {
  if (!value) {
    return "";
  }

  if (value.length <= visible * 2) {
    return `${value.slice(0, visible)}...`;
  }

  return `${value.slice(0, visible)}...${value.slice(-visible)}`;
}

export function getMaskedSettingsSnapshot(settings: AppSettings) {
  return {
    ...settings,
    bot: {
      ...settings.bot,
      discordBotToken: settings.bot.discordBotToken
        ? maskSecret(settings.bot.discordBotToken)
        : "",
    },
    payment: {
      ...settings.payment,
      paymenkuApiKey: settings.payment.paymenkuApiKey
        ? maskSecret(settings.payment.paymenkuApiKey)
        : "",
      paymenkuWebhookSecret: settings.payment.paymenkuWebhookSecret
        ? maskSecret(settings.payment.paymenkuWebhookSecret)
        : "",
    },
    telegram: {
      ...settings.telegram,
      telegramBotToken: settings.telegram.telegramBotToken
        ? maskSecret(settings.telegram.telegramBotToken)
        : "",
    },
  };
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  return value === "true";
}

function normalizePartialSettings<T extends Record<string, string | boolean>>(
  current: T,
  input: Partial<T>,
  options?: { preserveSecrets?: boolean },
) {
  const next = { ...input };

  if (options?.preserveSecrets) {
    for (const key of [...botKeys, ...paymentKeys, ...telegramKeys]) {
      const typedKey = key as keyof T;
      const value = next[typedKey];

      if (typeof value === "string" && value.trim() === "") {
        next[typedKey] = current[typedKey];
      }
    }
  }

  return next;
}
