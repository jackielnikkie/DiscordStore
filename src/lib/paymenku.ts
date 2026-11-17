import { createWebhookSignature, timingSafeCompare } from "./crypto";
import { detectPaymenkuMode, getPaymentSettings } from "./settings";

const PAYMENKU_BASE_URL = "https://paymenku.com/api/v1";
const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;
const CHANNEL_CACHE_MS = 10 * 60 * 1000;

export type PaymenkuChannel = {
  code: string;
  name: string;
  type: "va" | "ewallet" | "qris" | "cstore" | string;
  group?: string;
  flow_type?: "direct" | "redirect" | string;
  icon?: string;
  fee_mode?: "merchant" | "customer" | "split" | string;
  fee_flat?: number;
  fee_percent?: number;
  min_amount?: number;
  max_amount?: number;
};

export type PaymenkuCreateTransactionInput = {
  amount: number;
  referenceId: string;
  customerName: string;
  customerEmail: string;
  idempotencyKey: string;
};

export type PaymenkuPaymentInfo = {
  transaction_id?: string;
  transaction_status?: string;
  qr_url?: string;
  qr_string?: string;
  bank?: string;
  va_number?: string;
  payment_code?: string;
  store?: string;
  checkout_url?: string;
  checkout_url_app?: string;
  merchant_name?: string;
  expiration_date?: string;
  simulator_url?: string;
  sandbox?: boolean;
};

export type PaymenkuTransaction = {
  trx_id: string;
  reference_id: string;
  amount: string | number;
  status: string;
  pay_url?: string;
  payment_info?: PaymenkuPaymentInfo;
  is_sandbox?: boolean;
  sandbox_mode?: boolean;
  sandbox_notice?: string;
  total_fee?: string | number;
  amount_received?: string | number;
  paid_at?: string | null;
  payment_channel?: string | { code?: string; name?: string; type?: string };
};

type Envelope<T> = {
  status?: string;
  message?: string;
  errors?: Record<string, string[]>;
  data?: T;
};

let channelCache: { at: number; channels: PaymenkuChannel[] } | null = null;

export function clearPaymenkuCache() {
  channelCache = null;
}

async function paymenkuRequest<T>(
  path: string,
  init: RequestInit & { apiKey: string },
): Promise<T> {
  const { apiKey, ...rest } = init;

  const response = await fetch(`${PAYMENKU_BASE_URL}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(rest.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
  });

  const json = (await response.json().catch(() => null)) as Envelope<T> | null;

  const failedEnvelope = json?.status && json.status !== "success";

  if (!response.ok || failedEnvelope || !json) {
    const validation = json?.errors
      ? Object.entries(json.errors)
          .map(([field, messages]) => `${field}: ${messages.join(", ")}`)
          .join("; ")
      : "";

    throw new Error(
      [json?.message || `Paymenku error ${response.status}`, validation]
        .filter(Boolean)
        .join(" — "),
    );
  }

  return (json.data ?? (json as unknown)) as T;
}

async function requireApiKey() {
  const settings = await getPaymentSettings();

  if (!settings.paymenkuApiKey) {
    throw new Error("Paymenku API key belum diatur");
  }

  return settings;
}

export async function listPaymenkuChannels(options?: { fresh?: boolean }) {
  const settings = await requireApiKey();

  if (!options?.fresh && channelCache && Date.now() - channelCache.at < CHANNEL_CACHE_MS) {
    return channelCache.channels;
  }

  const channels = await paymenkuRequest<PaymenkuChannel[]>("/payment-channels", {
    method: "GET",
    apiKey: settings.paymenkuApiKey,
  });

  const list = Array.isArray(channels) ? channels : [];
  channelCache = { at: Date.now(), channels: list };
  return list;
}

async function assertAmountAllowed(channelCode: string, amount: number) {
  try {
    const channels = await listPaymenkuChannels();
    const channel = channels.find((entry) => entry.code === channelCode);

    if (!channel) {
      return;
    }

    const min = Number(channel.min_amount ?? 0);
    const max = Number(channel.max_amount ?? 0);

    if (min && amount < min) {
      throw new Error(
        `Minimal pembayaran ${channel.name || channelCode} adalah Rp ${min.toLocaleString("id-ID")}`,
      );
    }

    if (max && amount > max) {
      throw new Error(
        `Maksimal pembayaran ${channel.name || channelCode} adalah Rp ${max.toLocaleString("id-ID")}`,
      );
    }
  } catch (error) {
    if (error instanceof Error && /^(Minimal|Maksimal)/.test(error.message)) {
      throw error;
    }

    // Daftar kanal tidak tersedia: jangan blokir checkout, biarkan Paymenku yang menolak.
  }
}

export async function createPaymenkuTransaction(
  input: PaymenkuCreateTransactionInput,
) {
  const settings = await requireApiKey();
  const channelCode = settings.paymenkuChannelCode || "qris";

  await assertAmountAllowed(channelCode, input.amount);

  const data = await paymenkuRequest<PaymenkuTransaction>("/transaction/create", {
    method: "POST",
    apiKey: settings.paymenkuApiKey,
    headers: { "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({
      channel_code: channelCode,
      amount: input.amount,
      reference_id: input.referenceId,
      customer_name: input.customerName,
      customer_email: input.customerEmail,
      return_url: settings.returnUrl,
      order_items: [{ name: `Order ${input.referenceId}`, quantity: 1 }],
    }),
  });

  return {
    data,
    mode:
      data.is_sandbox || data.sandbox_mode
        ? "sandbox"
        : detectPaymenkuMode(settings.paymenkuApiKey),
  };
}

export async function checkPaymenkuStatus(orderId: string) {
  const settings = await requireApiKey();

  return paymenkuRequest<PaymenkuTransaction>(
    `/check-status/${encodeURIComponent(orderId)}`,
    { method: "GET", apiKey: settings.paymenkuApiKey },
  );
}

export async function cancelPaymenkuTransaction(trxId: string) {
  const settings = await requireApiKey();

  return paymenkuRequest<{ trx_id: string; status: string }>("/transaction/cancel", {
    method: "POST",
    apiKey: settings.paymenkuApiKey,
    body: JSON.stringify({ trx_id: trxId }),
  });
}

export async function refundPaymenkuTransaction(input: {
  trxId: string;
  refundAmount: number;
  reason?: string;
}) {
  const settings = await requireApiKey();

  return paymenkuRequest<{ trx_id: string; status: string; refund_amount: number }>(
    "/transaction/refund",
    {
      method: "POST",
      apiKey: settings.paymenkuApiKey,
      body: JSON.stringify({
        trx_id: input.trxId,
        refund_amount: input.refundAmount,
        reason: input.reason?.slice(0, 255),
      }),
    },
  );
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
