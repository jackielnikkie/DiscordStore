"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminSession } from "../../lib/auth";
import { OrderStatus } from "../../lib/db-types";
import { prisma } from "../../lib/db";
import {
  cancelOrder,
  deliverOrder,
  markOrderPaid,
  resendDelivery,
} from "../../services/orderService";
import { checkOrderPaymentStatus } from "../../services/paymentService";

const SANDBOX_MESSAGE =
  "Transaksi sandbox: aktifkan toggle 'Izinkan delivery transaksi sandbox' di Paymenku Settings";

export async function resendOrderAction(formData: FormData) {
  await requireAdminSession();
  const redirectTo = getRedirectTarget(formData, "/admin/orders");

  try {
    const outcome = deliveryOutcome(await resendDelivery(asString(formData.get("orderId"))));
    revalidateOrderPages(redirectTo);

    if (outcome.delivered) {
      redirectWithState(redirectTo, "message", "Delivery dikirim ulang");
    }

    if (outcome.reason === "sandbox_blocked" || /sandbox/i.test(outcome.reason)) {
      redirectWithState(redirectTo, "error", SANDBOX_MESSAGE);
    }

    if (outcome.reason === "already_delivered") {
      redirectWithState(
        redirectTo,
        "message",
        "Order sudah pernah delivered; delivery tidak diulang",
      );
    }

    redirectWithState(
      redirectTo,
      "error",
      outcome.reason || "Resend delivery gagal: alasan tidak diketahui",
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectWithState(
      redirectTo,
      "error",
      error instanceof Error ? error.message : "Resend delivery gagal",
    );
  }
}

export async function checkPaymentAction(formData: FormData) {
  await requireAdminSession();
  const redirectTo = getRedirectTarget(formData, "/admin/orders");
  const orderId = asString(formData.get("orderId"));

  try {
    const checked = await checkOrderPaymentStatus(orderId);

    // Self-heal: order PAID tanpa delivery dicoba kirim ulang sekali.
    if (checked?.status === OrderStatus.PAID && !checked.deliveredAt) {
      await deliverOrder(orderId).catch(() => null);
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    revalidateOrderPages(redirectTo);

    if (!order) {
      redirectWithState(redirectTo, "error", "Order tidak ditemukan");
    }

    if (order.status !== OrderStatus.PAID) {
      redirectWithState(redirectTo, "message", `Status order: ${order.status}`);
    }

    if (order.deliveredAt) {
      redirectWithState(redirectTo, "message", "Status PAID. Delivery sudah terkirim");
    }

    if (order.deliveryError) {
      redirectWithState(
        redirectTo,
        "error",
        `Status PAID, delivery belum terkirim: ${order.deliveryError}`,
      );
    }

    redirectWithState(redirectTo, "message", "Status PAID. Delivery belum terkirim");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectWithState(
      redirectTo,
      "error",
      error instanceof Error ? error.message : "Cek payment gagal",
    );
  }
}

export async function markPaidAction(formData: FormData) {
  await requireAdminSession();
  const redirectTo = getRedirectTarget(formData, "/admin/orders");
  const orderId = asString(formData.get("orderId"));

  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order) {
      throw new Error("Order tidak ditemukan");
    }

    if (order.status === OrderStatus.PAID || order.status === OrderStatus.REFUNDED) {
      redirectWithState(
        redirectTo,
        "message",
        `Order sudah ${order.status}, status tidak berubah`,
      );
    }

    await markOrderPaid(order.referenceId, {
      status: "paid",
      rawJson: JSON.stringify({ manual: true }),
    });

    const fresh = await prisma.order.findUnique({ where: { id: orderId } });
    revalidateOrderPages(redirectTo);

    if (fresh?.deliveredAt) {
      redirectWithState(redirectTo, "message", "Order ditandai paid, delivery terkirim");
    }

    if (fresh?.deliveryError) {
      redirectWithState(
        redirectTo,
        "error",
        `Order ditandai paid, delivery gagal: ${fresh.deliveryError}`,
      );
    }

    redirectWithState(redirectTo, "message", "Order ditandai paid, delivery tertunda");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectWithState(
      redirectTo,
      "error",
      error instanceof Error ? error.message : "Mark paid gagal",
    );
  }
}

export async function cancelOrderAction(formData: FormData) {
  await requireAdminSession();
  const redirectTo = getRedirectTarget(formData, "/admin/orders");
  const orderId = asString(formData.get("orderId"));

  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order) {
      throw new Error("Order tidak ditemukan");
    }

    if (order.status !== OrderStatus.PENDING) {
      redirectWithState(
        redirectTo,
        "error",
        `Order berstatus ${order.status}, hanya PENDING yang bisa dibatalkan`,
      );
    }

    await cancelOrder(orderId);
    revalidateOrderPages(redirectTo);
    redirectWithState(redirectTo, "message", "Order dibatalkan (CANCELLED)");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectWithState(
      redirectTo,
      "error",
      error instanceof Error ? error.message : "Cancel order gagal",
    );
  }
}

/** Terima bentuk baru { delivered, reason, order } maupun order mentah (legacy). */
function deliveryOutcome(raw: unknown) {
  const value = (raw ?? {}) as {
    delivered?: unknown;
    reason?: unknown;
    deliveredAt?: unknown;
    deliveryError?: unknown;
  };

  if (typeof value.delivered === "boolean") {
    return {
      delivered: value.delivered,
      reason: typeof value.reason === "string" ? value.reason : "",
    };
  }

  return {
    delivered: Boolean(value.deliveredAt),
    reason: typeof value.deliveryError === "string" ? value.deliveryError : "",
  };
}

function revalidateOrderPages(redirectTo: string) {
  revalidatePath(redirectTo);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/payments");
  revalidatePath("/admin");
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

function redirectWithState(path: string, key: "message" | "error", value: string): never {
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
