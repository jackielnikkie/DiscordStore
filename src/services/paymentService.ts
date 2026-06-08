import { OrderStatus } from "../lib/db-types";

import { prisma } from "../lib/db";
import { checkPaymenkuStatus } from "../lib/paymenku";
import {
  cancelOrder,
  expireOrder,
  markOrderPaid,
  markOrderTerminalStatus,
} from "./orderService";

export async function checkOrderPaymentStatus(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
  });

  if (!order) {
    throw new Error("Order tidak ditemukan");
  }

  const orderKey = order.paymenkuTrxId || order.referenceId;
  const result = await checkPaymenkuStatus(orderKey);
  const status = extractStatus(result);
  const payload = {
    trx_id: extractString(result, "trx_id"),
    reference_id: extractString(result, "reference_id"),
    status,
    amount: extractValue(result, "amount"),
    total_fee: extractValue(result, "total_fee"),
    amount_received: extractValue(result, "amount_received"),
    payment_channel: extractString(result, "payment_channel"),
    paid_at: extractString(result, "paid_at"),
    is_sandbox: extractBoolean(result, "is_sandbox"),
    rawJson: JSON.stringify(result),
  };

  if (status === "paid") {
    return markOrderPaid(order.referenceId, payload);
  }

  if (status === "expired") {
    return expireOrder(order.id);
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

function extractStatus(data: unknown) {
  if (typeof data !== "object" || data === null) {
    return "pending";
  }

  const candidates = [
    extractString(data, "transaction_status"),
    extractNestedString(data, "payment_info", "transaction_status"),
    extractString(data, "status"),
    extractNestedString(data, "data", "transaction_status"),
    extractNestedString(data, "data", "status"),
    extractDoubleNestedString(data, "data", "payment_info", "transaction_status"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase();

    if (normalized === "success") {
      continue;
    }

    return normalized;
  }

  return "pending";
}

function extractString(data: unknown, key: string) {
  if (typeof data !== "object" || data === null) {
    return "";
  }

  if (key in data && typeof (data as Record<string, unknown>)[key] === "string") {
    return (data as Record<string, string>)[key];
  }

  const nestedData = (data as { data?: unknown }).data;

  if (
    typeof nestedData === "object" &&
    nestedData !== null &&
    key in nestedData &&
    typeof (nestedData as Record<string, unknown>)[key] === "string"
  ) {
    return (nestedData as Record<string, string>)[key];
  }

  return "";
}

function extractValue(data: unknown, key: string) {
  const stringValue = extractString(data, key);

  if (stringValue) {
    return stringValue;
  }

  if (typeof data === "object" && data !== null && key in data) {
    return (data as Record<string, unknown>)[key] as string | number | undefined;
  }

  const nestedData = (data as { data?: unknown })?.data;

  if (typeof nestedData === "object" && nestedData !== null && key in nestedData) {
    return (nestedData as Record<string, unknown>)[key] as
      | string
      | number
      | undefined;
  }

  return undefined;
}

function extractBoolean(data: unknown, key: string) {
  if (typeof data !== "object" || data === null) {
    return undefined;
  }

  if (key in data && typeof (data as Record<string, unknown>)[key] === "boolean") {
    return (data as Record<string, boolean>)[key];
  }

  const nestedData = (data as { data?: unknown }).data;

  if (
    typeof nestedData === "object" &&
    nestedData !== null &&
    key in nestedData &&
    typeof (nestedData as Record<string, unknown>)[key] === "boolean"
  ) {
    return (nestedData as Record<string, boolean>)[key];
  }

  return undefined;
}

function extractNestedString(data: unknown, parentKey: string, key: string) {
  if (typeof data !== "object" || data === null) {
    return "";
  }

  const parent = (data as Record<string, unknown>)[parentKey];
  return extractString(parent, key);
}

function extractDoubleNestedString(
  data: unknown,
  firstKey: string,
  secondKey: string,
  key: string,
) {
  if (typeof data !== "object" || data === null) {
    return "";
  }

  const first = (data as Record<string, unknown>)[firstKey];

  if (typeof first !== "object" || first === null) {
    return "";
  }

  const second = (first as Record<string, unknown>)[secondKey];
  return extractString(second, key);
}
