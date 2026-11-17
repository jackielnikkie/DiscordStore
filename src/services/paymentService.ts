import { OrderStatus } from "../lib/db-types";

import { prisma } from "../lib/db";
import { checkPaymenkuStatus } from "../lib/paymenku";
import {
  cancelOrder,
  deliverOrder,
  expireOrder,
  markOrderPaid,
  markOrderTerminalStatus,
  type DeliveryOutcome,
} from "./orderService";

/**
 * Self-heal: order PAID tapi belum terkirim dan tanpa deliveryError.
 * Dipakai admin (C) supaya aksi tidak mengklaim sukses palsu.
 */
export async function ensureOrderDelivered(
  orderId: string,
): Promise<DeliveryOutcome | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
  });

  if (!order) {
    throw new Error("Order tidak ditemukan");
  }

  if (
    order.status !== OrderStatus.PAID ||
    order.deliveredAt ||
    order.deliveryError
  ) {
    return null;
  }

  return deliverOrder(orderId);
}

/** Rekonsiliasi saja — webhook tetap sumber status resmi (docs Paymenku). */
export async function checkOrderPaymentStatus(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
  });

  if (!order) {
    throw new Error("Order tidak ditemukan");
  }

  const orderKey = order.paymenkuTrxId || order.referenceId;
  const data = await checkPaymenkuStatus(orderKey);
  const status = String(data.status || "pending").toLowerCase();
  const channel =
    typeof data.payment_channel === "string"
      ? data.payment_channel
      : data.payment_channel?.code || "";

  const payload = {
    trx_id: data.trx_id || "",
    reference_id: data.reference_id || order.referenceId,
    status,
    amount: data.amount,
    total_fee: data.total_fee,
    amount_received: data.amount_received,
    payment_channel: channel,
    paid_at: data.paid_at || "",
    is_sandbox: data.is_sandbox,
    rawJson: JSON.stringify(data),
  };

  if (status === "paid") {
    return markOrderPaid(order.referenceId, payload);
  }

  if (status === "expired") {
    return cancelOrder(order.id);
  }

  if (status === "failed") {
    return markOrderTerminalStatus(order.referenceId, OrderStatus.FAILED, payload);
  }

  if (status === "cancelled") {
    return cancelOrder(order.id);
  }

  if (status === "refunded") {
    return markOrderTerminalStatus(order.referenceId, OrderStatus.REFUNDED, payload);
  }

  if (
    order.status === OrderStatus.PENDING &&
    order.expiresAt &&
    new Date(order.expiresAt).getTime() <= Date.now()
  ) {
    return expireOrder(order.id);
  }

  return order;
}
