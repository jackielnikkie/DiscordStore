import { NextRequest, NextResponse } from "next/server";

import { OrderStatus } from "../../../../lib/db-types";
import { prisma } from "../../../../lib/db";
import { verifyPaymenkuWebhookSignature } from "../../../../lib/paymenku";
import { markOrderPaid, markOrderTerminalStatus } from "../../../../services/orderService";

const MAX_WEBHOOK_BODY_BYTES = 32 * 1024;

// SEC-09: simpan allowlist header saja, nilai sensitif diredaksi.
const HEADER_ALLOWLIST = ["content-type", "user-agent"];
const SENSITIVE_HEADER = /(signature|authorization|cookie|token|secret|api-?key)/i;

export async function POST(request: NextRequest) {
  const declaredSize = Number(request.headers.get("content-length") || 0);

  if (declaredSize > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  // SEC-04: Content-Length bisa absen/bohong, jadi tetap hitung byte saat streaming.
  const rawBody = await readBodyLimited(request, MAX_WEBHOOK_BODY_BYTES);

  if (rawBody === null) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const signature = request.headers.get("x-paymenku-signature") || "";
  const timestamp = request.headers.get("x-paymenku-timestamp") || "";

  const isValid = await verifyPaymenkuWebhookSignature(rawBody, timestamp, signature);

  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = safeParseJson(rawBody);
  let logId: string;

  try {
    const log = await prisma.paymentWebhookLog.create({
      data: {
        event: stringValue(payload?.event),
        trxId: stringValue(payload?.trx_id),
        referenceId: stringValue(payload?.reference_id),
        status: stringValue(payload?.status),
        headersJson: JSON.stringify(collectLogHeaders(request.headers)),
        bodyJson: rawBody,
        isValid: true,
      },
    });
    logId = log.id;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing gagal" },
      { status: 400 },
    );
  }

  // SEC-10: proses SEBELUM 2xx. Crash/gagal → provider retry (5xx); log tanpa
  // processedAt + poller PENDING di src/bot/index.ts jadi backstop rekonsiliasi.
  try {
    await processPayload(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing gagal";
    console.error("[paymenku] webhook gagal diproses", message);
    const fatal = /tidak ditemukan|reference_id tidak ada/i.test(message);
    return NextResponse.json({ ok: false }, { status: fatal ? 400 : 503 });
  }

  await prisma.paymentWebhookLog
    .update({ where: { id: logId }, data: { processedAt: new Date() } })
    .catch(() => null);

  return NextResponse.json({ ok: true });
}

async function processPayload(payload: Record<string, unknown> | null) {
  const referenceId = stringValue(payload?.reference_id);

  if (!referenceId) {
    throw new Error("reference_id tidak ada di payload");
  }

  const status = stringValue(payload?.status).toLowerCase();
  const updatePayload = {
    trx_id: stringValue(payload?.trx_id),
    reference_id: referenceId,
    status,
    amount: payload?.amount as string | number | undefined,
    total_fee: payload?.total_fee as string | number | undefined,
    amount_received: payload?.amount_received as string | number | undefined,
    payment_channel: stringValue(payload?.payment_channel),
    paid_at: stringValue(payload?.paid_at),
    is_sandbox: booleanValue(payload?.is_sandbox),
    rawJson: JSON.stringify(payload),
  };

  if (status === "paid") {
    await markOrderPaid(referenceId, updatePayload);
    return;
  }

  if (status === "expired") {
    // Owner rule: expired → CANCELLED (routing ada di markOrderTerminalStatus).
    await markOrderTerminalStatus(referenceId, OrderStatus.EXPIRED, updatePayload);
    return;
  }

  if (status === "failed") {
    await markOrderTerminalStatus(referenceId, OrderStatus.FAILED, updatePayload);
    return;
  }

  if (status === "cancelled") {
    await markOrderTerminalStatus(referenceId, OrderStatus.CANCELLED, updatePayload);
    return;
  }

  if (status === "refunded") {
    await markOrderTerminalStatus(referenceId, OrderStatus.REFUNDED, updatePayload);
  }
}

/** Baca body sambil menghitung byte; `null` = melewati batas. */
async function readBodyLimited(request: Request, maxBytes: number) {
  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done || !value) {
      break;
    }

    total += value.byteLength;

    if (total > maxBytes) {
      await reader.cancel().catch(() => null);
      return null;
    }

    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function collectLogHeaders(headers: Headers) {
  const stored: Record<string, string> = {};

  for (const [name, value] of headers.entries()) {
    const key = name.toLowerCase();
    const allowed = HEADER_ALLOWLIST.includes(key) || key.startsWith("x-paymenku-");

    if (!allowed) {
      continue;
    }

    stored[key] = SENSITIVE_HEADER.test(key) ? "[redacted]" : value;
  }

  return stored;
}

function safeParseJson(rawBody: string) {
  try {
    return JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}
