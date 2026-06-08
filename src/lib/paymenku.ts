import { createWebhookSignature, timingSafeCompare } from "./crypto";
import { detectPaymenkuMode, getPaymentSettings } from "./settings";

const PAYMENKU_BASE_URL = "https://paymenku.com/api/v1";
const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

export type PaymenkuCreateTransactionInput = {
  amount: number;
  referenceId: string;
  customerName: string;
  customerEmail: string;
  idempotencyKey: string;
};

type PaymenkuTransactionResponse = {
  status: string;
  data: {
    trx_id: string;
    reference_id: string;
    amount: string;
    status: string;
    pay_url: string;
    payment_info?: {
      qr_url?: string;
      qr_string?: string;
      expiration_date?: string;
    };
  };
};

export async function createPaymenkuTransaction(
  input: PaymenkuCreateTransactionInput,
) {
  const settings = await getPaymentSettings();

  if (!settings.paymenkuApiKey) {
    throw new Error("Paymenku API key belum diatur");
  }

  const response = await fetch(`${PAYMENKU_BASE_URL}/transaction/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.paymenkuApiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      channel_code: settings.paymenkuChannelCode || "qris",
      amount: input.amount,
      reference_id: input.referenceId,
      customer_name: input.customerName,
      customer_email: input.customerEmail,
      return_url: settings.returnUrl,
    }),
    cache: "no-store",
  });

  const json = (await response.json()) as PaymenkuTransactionResponse | {
    message?: string;
  };

  if (!response.ok || !("data" in json)) {
    const errorMessage = (json as { message?: string }).message || "Gagal membuat transaksi Paymenku";
    throw new Error(errorMessage);
  }

  return {
    ...json,
    mode: detectPaymenkuMode(settings.paymenkuApiKey),
  };
}

export async function checkPaymenkuStatus(orderId: string) {
  const settings = await getPaymentSettings();

  if (!settings.paymenkuApiKey) {
    throw new Error("Paymenku API key belum diatur");
  }

  const response = await fetch(`${PAYMENKU_BASE_URL}/check-status/${orderId}`, {
    headers: {
      Authorization: `Bearer ${settings.paymenkuApiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(
      typeof json?.message === "string"
        ? json.message
        : "Gagal cek status Paymenku",
    );
  }

  return json;
}

export async function verifyPaymenkuWebhookSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
  secret?: string,
) {
  const settings = await getPaymentSettings();
  const webhookSecret = secret || settings.paymenkuWebhookSecret;

  if (!webhookSecret || !timestamp || !signature) {
    return false;
  }

  const timestampMs = parseWebhookTimestampMs(timestamp);

  if (!timestampMs || Math.abs(Date.now() - timestampMs) > WEBHOOK_TOLERANCE_MS) {
    return false;
  }

  const expected = createWebhookSignature(rawBody, timestamp, webhookSecret);
  return timingSafeCompare(expected, signature);
}

function parseWebhookTimestampMs(timestamp: string) {
  const trimmed = timestamp.trim();

  if (!trimmed) {
    return null;
  }

  if (/^\d{10}$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }

  if (/^\d{13}$/.test(trimmed)) {
    return Number(trimmed);
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}
