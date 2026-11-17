"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";

import { syncAutoOrderEmbed } from "../../bot/services/embedSync";
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  changeAdminPasswordAction,
  loginAdmin,
  logoutAdmin,
  requireAdminSession,
} from "../../lib/auth";
import { prisma } from "../../lib/db";
import {
  detectPaymenkuMode,
  getPaymentSettings,
  getTelegramSettings,
  requestEmbedSync,
  saveBotSettings,
  savePaymentSettings,
  saveTelegramSettings,
  saveTextSettings,
} from "../../lib/settings";
import { getTelegramMe, sendTelegramMessage } from "../../lib/telegram";
import {
  botSettingsSchema,
  embedSettingsSchema,
  loginSchema,
  paymentSettingsSchema,
  productSchema,
  stockAddSchema,
  stockImportSchema,
  telegramSettingsSchema,
  textSettingsSchema,
} from "../../lib/validators";
import { cancelOrder, markOrderPaid, resendDelivery } from "../../services/orderService";
import { checkOrderPaymentStatus } from "../../services/paymentService";
import { testDiscordConnection } from "../../lib/discord";

export async function loginAction(formData: FormData) {
  const redirectTo = "/admin/login";
  const values = Object.fromEntries(formData);

  try {
    const input = loginSchema.parse(values);
    const headerStore = await headers();
    const ipAddress =
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headerStore.get("x-real-ip") ||
      "unknown";
    const result = await loginAdmin(input.username, input.password, ipAddress);

    if (!result.success) {
      return redirectWithState(redirectTo, "error", result.message);
    }

    redirect("/admin");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return redirectWithState(
      redirectTo,
      "error",
      error instanceof Error ? error.message : "Login gagal",
    );
  }
}

export async function logoutAction() {
  await logoutAdmin();
  redirect("/admin/login");
}

export async function saveProductAction(formData: FormData) {
  await requireAdminSession();
  const redirectTo = getRedirectTarget(formData, "/admin/products");

  try {
    const input = productSchema.parse(Object.fromEntries(formData));
    const payload = {
      name: input.name,
      slug: input.slug,
      description: emptyToNull(input.description),
      imageUrl: emptyToNull(input.imageUrl),
      price: input.price,
      bulkPriceJson: emptyToNull(input.bulkPriceJson),
      formatLabel: emptyToNull(input.formatLabel),
      type: input.type,
      customText: emptyToNull(input.customText),
      isActive: input.isActive,
      sortOrder: input.sortOrder,
    };

    const product = input.id
      ? await prisma.product.update({
          where: { id: input.id },
          data: payload,
        })
      : await prisma.product.create({
          data: payload,
        });

    await requestEmbedSync();
    revalidateEverywhere();
    redirect(`${input.id ? `/admin/products/${product.id}` : "/admin/products"}?message=${encodeURIComponent("Produk berhasil disimpan")}`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectWithState(
      redirectTo,
      "error",
      formatActionError(error, "Produk gagal disimpan"),
    );
  }
}

export async function deleteProductAction(formData: FormData) {
  await requireAdminSession();
  const productId = asString(formData.get("productId"));
  const redirectTo = getRedirectTarget(formData, "/admin/products");

  try {
    await prisma.product.delete({
      where: { id: productId },
    });
    await requestEmbedSync();
    revalidateEverywhere();
    redirectWithState(redirectTo, "message", "Produk berhasil dihapus");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectWithState(
      redirectTo,
      "error",
      formatActionError(error, "Produk tidak bisa dihapus. Cek apakah sudah punya order."),
    );
  }
}

export async function addStockAction(formData: FormData) {
  await requireAdminSession();
  const redirectTo = getRedirectTarget(formData, "/admin/products");

  try {
    const input = stockAddSchema.parse(Object.fromEntries(formData));
    await prisma.stockItem.create({
      data: {
        productId: input.productId,
        content: input.content,
      },
    });
    await requestEmbedSync();
    revalidatePath(redirectTo);
    revalidateEverywhere();
    redirectWithState(redirectTo, "message", "Stok berhasil ditambahkan");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[addStockAction]", error);
    redirectWithState(
      redirectTo,
      "error",
      formatActionError(error, "Tambah stok gagal"),
    );
  }
}

export async function importStockAction(formData: FormData) {
  await requireAdminSession();
  const redirectTo = getRedirectTarget(formData, "/admin/products");

  try {
    const input = stockImportSchema.parse(Object.fromEntries(formData));
    const lines = input.lines
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    await prisma.stockItem.createMany({
      data: lines.map((line) => ({
        productId: input.productId,
        content: line,
      })),
    });
    await requestEmbedSync();
    revalidatePath(redirectTo);
    revalidateEverywhere();
    redirectWithState(
      redirectTo,
      "message",
      `${lines.length} stok berhasil diimport`,
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[importStockAction]", error);
    redirectWithState(
      redirectTo,
      "error",
      formatActionError(error, "Import stok gagal"),
    );
  }
}

export async function deleteStockAction(formData: FormData) {
  await requireAdminSession();
  const stockId = asString(formData.get("stockId"));
  const redirectTo = getRedirectTarget(formData, "/admin/products");

  try {
    await prisma.stockItem.delete({
      where: { id: stockId },
    });
    await requestEmbedSync();
    revalidatePath(redirectTo);
    revalidateEverywhere();
    redirectWithState(redirectTo, "message", "Stok berhasil dihapus");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[deleteStockAction]", error);
    redirectWithState(
      redirectTo,
      "error",
      formatActionError(error, "Hapus stok gagal"),
    );
  }
}

export async function saveBotSettingsAction(formData: FormData) {
  await requireAdminSession();
  const redirectTo = getRedirectTarget(formData, "/admin/settings/bot");

  try {
    const input = botSettingsSchema.parse(Object.fromEntries(formData));
    await saveBotSettings(input, { preserveSecrets: true });
    await requestEmbedSync();
    revalidateEverywhere();
    redirectWithState(
      redirectTo,
      "message",
      "Bot settings tersimpan. Restart worker jika token berubah.",
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectWithState(
      redirectTo,
      "error",
      formatActionError(error, "Bot settings gagal disimpan"),
    );
  }
}

export async function saveTelegramSettingsAction(formData: FormData) {
  await requireAdminSession();
  const redirectTo = getRedirectTarget(formData, "/admin/settings/telegram");

  try {
    const input = telegramSettingsSchema.parse(Object.fromEntries(formData));
    await saveTelegramSettings(input, { preserveSecrets: true });
    revalidateEverywhere();
    redirectWithState(
      redirectTo,
      "message",
      "Telegram settings tersimpan. Worker memakai token baru dalam ±15 detik.",
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectWithState(
      redirectTo,
      "error",
      formatActionError(error, "Telegram settings gagal disimpan"),
    );
  }
}

export async function testTelegramAction(formData: FormData) {
  await requireAdminSession();
  const redirectTo = getRedirectTarget(formData, "/admin/settings/telegram");

  try {
    const settings = await getTelegramSettings();

    if (!settings.telegramBotToken) {
      redirectWithState(redirectTo, "error", "Token bot Telegram belum diisi");
    }

    const me = await getTelegramMe(settings.telegramBotToken);
    let message = `Bot login sebagai @${me.username}.`;

    if (settings.telegramAdminChannelId) {
      await sendTelegramMessage(
        settings.telegramAdminChannelId,
        "Tes koneksi bot dari dashboard LapakLoka-MultiBotStore.",
      );
      message += " Pesan tes terkirim ke chat admin.";
    }

    redirectWithState(redirectTo, "message", message);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectWithState(
      redirectTo,
      "error",
      formatActionError(error, "Tes koneksi Telegram gagal"),
    );
  }
}

export async function savePaymentSettingsAction(formData: FormData) {
  await requireAdminSession();
  const redirectTo = getRedirectTarget(formData, "/admin/settings/payment");

  try {
    const input = paymentSettingsSchema.parse(Object.fromEntries(formData));
    await savePaymentSettings(input, { preserveSecrets: true });
    const saved = await getPaymentSettings();
    revalidateEverywhere();
    redirectWithState(
      redirectTo,
      "message",
      `Payment settings tersimpan. Mode: ${detectPaymenkuMode(saved.paymenkuApiKey || "")}`,
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectWithState(
      redirectTo,
      "error",
      formatActionError(error, "Payment settings gagal disimpan"),
    );
  }
}

export async function saveTextSettingsAction(formData: FormData) {
  await requireAdminSession();
  const redirectTo = getRedirectTarget(formData, "/admin/settings/bot");

  try {
    const input = textSettingsSchema.parse(Object.fromEntries(formData));
    await saveTextSettings(input);
    await requestEmbedSync();
    revalidateEverywhere();
    redirectWithState(redirectTo, "message", "Template teks berhasil disimpan");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectWithState(
      redirectTo,
      "error",
      formatActionError(error, "Template teks gagal disimpan"),
    );
  }
}

export async function saveEmbedSettingsAction(formData: FormData) {
  await requireAdminSession();
  const redirectTo = getRedirectTarget(formData, "/admin/settings/embed");

  try {
    const input = embedSettingsSchema.parse(Object.fromEntries(formData));
    await saveTextSettings(input);
    await requestEmbedSync();
    revalidateEverywhere();
    redirectWithState(redirectTo, "message", "Embed settings berhasil disimpan");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectWithState(
      redirectTo,
      "error",
      formatActionError(error, "Embed settings gagal disimpan"),
    );
  }
}

export async function resendOrderAction(formData: FormData) {
  await requireAdminSession();
  const redirectTo = getRedirectTarget(formData, "/admin/orders");

  try {
    await resendDelivery(asString(formData.get("orderId")));
    revalidateEverywhere();
    redirectWithState(redirectTo, "message", "DM delivery dikirim ulang");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectWithState(
      redirectTo,
      "error",
      formatActionError(error, "Resend delivery gagal"),
    );
  }
}

export async function markPaidAction(formData: FormData) {
  await requireAdminSession();
  const redirectTo = getRedirectTarget(formData, "/admin/orders");

  try {
    const orderId = asString(formData.get("orderId"));
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error("Order tidak ditemukan");
    }

    await markOrderPaid(order.referenceId, {
      status: "paid",
      rawJson: JSON.stringify({ manual: true }),
    });
    revalidateEverywhere();
    redirectWithState(redirectTo, "message", "Order ditandai paid");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectWithState(
      redirectTo,
      "error",
      formatActionError(error, "Mark paid gagal"),
    );
  }
}

export async function cancelOrderAction(formData: FormData) {
  await requireAdminSession();
  const redirectTo = getRedirectTarget(formData, "/admin/orders");

  try {
    await cancelOrder(asString(formData.get("orderId")));
    revalidateEverywhere();
    redirectWithState(redirectTo, "message", "Order dibatalkan");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectWithState(
      redirectTo,
      "error",
      formatActionError(error, "Cancel order gagal"),
    );
  }
}

export async function checkPaymentAction(formData: FormData) {
  await requireAdminSession();
  const redirectTo = getRedirectTarget(formData, "/admin/orders");

  try {
    await checkOrderPaymentStatus(asString(formData.get("orderId")));
    revalidateEverywhere();
    redirectWithState(redirectTo, "message", "Status payment diperbarui");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectWithState(
      redirectTo,
      "error",
      formatActionError(error, "Cek payment gagal"),
    );
  }
}

export async function syncEmbedAction(formData: FormData) {
  await requireAdminSession();
  const redirectTo = getRedirectTarget(formData, "/admin/settings/bot");

  try {
    const result = await syncAutoOrderEmbed();
    if (!result.ok) {
      redirectWithState(redirectTo, "error", result.message);
    }
    revalidateEverywhere();
    redirectWithState(redirectTo, "message", result.message);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectWithState(
      redirectTo,
      "error",
      formatActionError(error, "Sync embed gagal"),
    );
  }
}

export async function testDiscordAction(formData: FormData) {
  await requireAdminSession();
  const redirectTo = getRedirectTarget(formData, "/admin/settings/bot");

  try {
    const result = await testDiscordConnection();
    redirectWithState(redirectTo, "message", result.message);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectWithState(
      redirectTo,
      "error",
      formatActionError(error, "Tes Discord gagal"),
    );
  }
}

export async function testPaymenkuAction(formData: FormData) {
  await requireAdminSession();
  const redirectTo = getRedirectTarget(formData, "/admin/settings/payment");

  try {
    const settings = await getPaymentSettings();
    const mode = detectPaymenkuMode(settings.paymenkuApiKey);

    if (mode === "unknown") {
      throw new Error("API key Paymenku belum valid atau belum disimpan");
    }

    redirectWithState(
      redirectTo,
      "message",
      `Format API key valid. Mode terdeteksi: ${mode}.`,
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectWithState(
      redirectTo,
      "error",
      formatActionError(error, "Tes Paymenku gagal"),
    );
  }
}

function revalidateEverywhere() {
  revalidatePath("/admin");
  revalidatePath("/admin/products");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/settings/bot");
  revalidatePath("/admin/settings/telegram");
  revalidatePath("/admin/settings/payment");
  revalidatePath("/admin/settings/text");
  revalidatePath("/admin/settings/embed");
}

function isRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT;")
  );
}

function redirectWithState(path: string, key: "message" | "error", value: string) {
  const url = new URL(path, "http://localhost");
  url.searchParams.set(key, value);
  redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

function getRedirectTarget(formData: FormData, fallback: string) {
  return asString(formData.get("redirectTo")) || fallback;
}

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function emptyToNull(value?: string) {
  return value && value.trim() ? value : null;
}

function formatActionError(error: unknown, fallback: string) {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => issue.message)
      .filter(Boolean)
      .join(". ");
  }

  return error instanceof Error ? error.message : fallback;
}

export async function changePasswordAction(formData: FormData) {
  await requireAdminSession();
  const redirectTo = getRedirectTarget(formData, "/admin/settings/account");
  const currentPassword = asString(formData.get("currentPassword"));
  const newPassword = asString(formData.get("password"));
  const confirmNewPassword = asString(formData.get("confirmPassword"));

  if (newPassword !== confirmNewPassword) {
    redirectWithState(redirectTo, "error", "Password baru dan konfirmasi tidak cocok");
  }

  if (newPassword.length < ADMIN_PASSWORD_MIN_LENGTH) {
    redirectWithState(
      redirectTo,
      "error",
      `Password minimal ${ADMIN_PASSWORD_MIN_LENGTH} karakter`,
    );
  }

  try {
    const result = await changeAdminPasswordAction(currentPassword, newPassword);
    if (!result.ok) {
      redirectWithState(redirectTo, "error", result.error || "Gagal mengubah password");
    }
    redirectWithState(redirectTo, "message", "Password berhasil diubah");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectWithState(redirectTo, "error", "Terjadi kesalahan, coba lagi");
  }
}
