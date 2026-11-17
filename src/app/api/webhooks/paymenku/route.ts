import { after, NextRequest, NextResponse } from "next/server";

import { OrderStatus } from "../../../../lib/db-types";
import { prisma } from "../../../../lib/db";
import { verifyPaymenkuWebhookSignature } from "../../../../lib/paymenku";
import { markOrderPaid, markOrderTerminalStatus } from "../../../../services/orderService";

const MAX_WEBHOOK_BODY_BYTES = 32 * 1024;

export async function POST(request: NextRequest) {
  const declaredSize = Number(request.headers.get("content-length") || 0);

  if (declaredSize > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const rawBody = await request.text();
  const bodySize = Buffer.byteLength(rawBody, "utf8");
  const signature = request.headers.get("x-paymenku-signature") || "";
  const timestamp = request.headers.get("x-paymenku-timestamp") || "";

  if (bodySize > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const isValid = await verifyPaymenkuWebhookSignature(rawBody, timestamp, signature);

  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = safeParseJson(rawBody);

  try {
    const log = await prisma.paymentWebhookLog.create({
      data: {
        event: stringValue(payload?.event),
        trxId: stringValue(payload?.trx_id),
        referenceId: stringValue(payload?.reference_id),
        status: stringValue(payload?.status),
        headersJson: JSON.stringify(Object.fromEntries(request.headers.entries())),
        bodyJson: rawBody,
        isValid: true,
      },
    });

    // Docs: balas 2xx dulu, proses di belakang. Webhook diulang bila lambat.
    after(async () => {
      try {
        await processPayload(payload);
        await prisma.paymentWebhookLog.update({
          where: { id: log.id },
          data: { processedAt: new Date() },
        });
      } catch (error) {
        console.error(
          "[paymenku] webhook gagal diproses",
          error instanceof Error ? error.message : error,
        );
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing gagal" },
      { status: 400 },
    );
  }
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
