import { OrderStatus, StockStatus } from "./db-types";

import { formatRupiah } from "./money";

export function getOrderTone(status: OrderStatus) {
  switch (status) {
    case OrderStatus.PAID:
      return "success";
    case OrderStatus.PENDING:
      return "warning";
    case OrderStatus.EXPIRED:
    case OrderStatus.FAILED:
    case OrderStatus.CANCELLED:
      return "danger";
    case OrderStatus.REFUNDED:
      return "info";
    default:
      return "neutral";
  }
}

export function getStockTone(status: StockStatus) {
  switch (status) {
    case StockStatus.AVAILABLE:
      return "success";
    case StockStatus.RESERVED:
      return "warning";
    case StockStatus.SOLD:
      return "info";
    default:
      return "neutral";
  }
}

export function formatDate(date?: Date | string | null) {
  if (!date) {
    return "-";
  }

  const resolved = typeof date === "string" ? new Date(date) : date;

  if (Number.isNaN(resolved.getTime())) {
    return typeof date === "string" ? date : "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(resolved);
}

export function formatOrderAmount(order: {
  paymentAmount?: number | null;
  subtotal: number;
}) {
  return formatRupiah(order.paymentAmount || order.subtotal);
}
