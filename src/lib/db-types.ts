export enum ProductType {
  STOCK_LINE = "STOCK_LINE",
  CUSTOM_TEXT = "CUSTOM_TEXT",
}

export function getProductTypeLabel(type: ProductType | string) {
  switch (type) {
    case ProductType.STOCK_LINE:
      return "Stock Line";
    case ProductType.CUSTOM_TEXT:
      return "Custom Text";
    default:
      return String(type);
  }
}

export enum StockStatus {
  AVAILABLE = "AVAILABLE",
  RESERVED = "RESERVED",
  SOLD = "SOLD",
}

export enum OrderStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  EXPIRED = "EXPIRED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
  REFUNDED = "REFUNDED",
}

export type Setting = {
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  bulkPriceJson: string | null;
  formatLabel: string | null;
  type: ProductType;
  customText: string | null;
  deliveryNote: string | null;
  isActive: boolean;
  sortOrder: number;
  soldCount: number;
  createdAt: string;
  updatedAt: string;
};

export type StockItem = {
  id: string;
  productId: string;
  content: string;
  status: StockStatus;
  reservedBy: string | null;
  soldOrderId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Order = {
  id: string;
  referenceId: string;
  platform: string;
  discordUserId: string;
  discordUsername: string | null;
  productId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  paymentAmount: number | null;
  status: OrderStatus;
  paymenkuTrxId: string | null;
  paymenkuPayUrl: string | null;
  paymenkuQrUrl: string | null;
  paymenkuQrString: string | null;
  paymenkuRawJson: string | null;
  paymentChannel: string | null;
  totalFee: number | null;
  amountReceived: number | null;
  isSandbox: boolean | null;
  expiresAt: string | null;
  paidAt: string | null;
  // ID pesan invoice (Telegram message_id / Discord message id) untuk dihapus saat paid.
  invoiceMessageId: string | null;
  deliveredAt: string | null;
  deliveryError: string | null;
  buyAlertSentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentWebhookLog = {
  id: string;
  provider: string;
  event: string | null;
  trxId: string | null;
  referenceId: string | null;
  status: string | null;
  headersJson: string | null;
  bodyJson: string;
  isValid: boolean;
  processedAt: string | null;
  createdAt: string;
};

export type AdminSession = {
  id: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
};
