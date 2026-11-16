import { ProductType } from "./db-types";
import { z } from "zod";

function stringToInt(defaultValue = 0) {
  return z.preprocess(
    (value) => {
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return defaultValue;
        return Number.parseInt(trimmed, 10);
      }
      return defaultValue;
    },
    z.number().int().min(0)
  );
}

function stringToBoolean(defaultValue = false) {
  return z.preprocess((value) => {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      return value === "on" || value === "true" || value === "1";
    }

    return defaultValue;
  }, z.boolean());
}

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Username wajib diisi"),
  password: z.string().min(1, "Password wajib diisi"),
});

export const productSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(2, "Nama produk minimal 2 karakter"),
  slug: z
    .string()
    .trim()
    .min(2, "Slug minimal 2 karakter")
    .regex(/^[a-z0-9-]+$/, "Slug hanya boleh huruf kecil, angka, dan dash"),
  description: z.string().trim().optional().or(z.literal("")),
  imageUrl: z.string().trim().url().optional().or(z.literal("")),
  price: stringToInt().refine((value) => value >= 0, "Harga tidak valid"),
  bulkPriceJson: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((value) => {
      if (!value) {
        return true;
      }

      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }, "Bulk price JSON tidak valid"),
  formatLabel: z.string().trim().optional().or(z.literal("")),
  type: z.nativeEnum(ProductType),
  customText: z.string().trim().optional().or(z.literal("")),
  isActive: stringToBoolean(true),
  sortOrder: stringToInt(),
});

export const stockAddSchema = z.object({
  productId: z.string().trim().min(1, "Produk wajib dipilih"),
  content: z.string().trim().min(1, "Isi stok wajib diisi"),
});

export const stockImportSchema = z.object({
  productId: z.string().trim().min(1, "Produk wajib dipilih"),
  lines: z.string().trim().min(1, "Data stok wajib diisi"),
});

export const botSettingsSchema = z.object({
  discordBotToken: z.string().trim().optional().or(z.literal("")),
  discordClientId: z.string().trim().optional().or(z.literal("")),
  discordGuildId: z.string().trim().optional().or(z.literal("")),
  autoOrderChannelId: z.string().trim().optional().or(z.literal("")),
  buyAlertChannelId: z.string().trim().optional().or(z.literal("")),
  adminRoleId: z.string().trim().optional().or(z.literal("")),
  enableBuyAlert: stringToBoolean(true),
  enableAutoSyncEmbed: stringToBoolean(true),
});

export const paymentSettingsSchema = z.object({
  paymenkuApiKey: z.string().trim().optional().or(z.literal("")),
  paymenkuWebhookSecret: z.string().trim().optional().or(z.literal("")),
  paymenkuChannelCode: z.string().trim().default("qris"),
  returnUrl: z.string().trim().url().optional().or(z.literal("")),
});

export const telegramSettingsSchema = z.object({
  telegramEnabled: stringToBoolean(false),
  telegramBotToken: z.string().trim().optional().or(z.literal("")),
  telegramAdminChannelId: z.string().trim().optional().or(z.literal("")),
});

export const textSettingsSchema = z.object({
  dmTestText: z.string().trim().min(1),
  dmInvoiceText: z.string().trim().min(1),
  dmPaymentSuccessText: z.string().trim().min(1),
  dmExpiredText: z.string().trim().min(1),
  dmFailedText: z.string().trim().min(1),
  warningDmClosed: z.string().trim().min(1),
  warningStockEmpty: z.string().trim().min(1),
  buyAlertTemplate: z.string().trim().min(1),
});

export const embedSettingsSchema = z.object({
  embedTitle: z.string().trim().min(1, "Judul embed wajib diisi"),
  embedDescription: z.string().trim().min(1, "Deskripsi embed wajib diisi"),
  embedFooter: z.string().trim().min(1, "Footer embed wajib diisi"),
});

export const orderActionSchema = z.object({
  orderId: z.string().trim().min(1),
});
