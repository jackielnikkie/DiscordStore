import { OrderStatus } from "../../../../lib/db-types";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "../../../../lib/db";
import { verifyPaymenkuWebhookSignature } from "../../../../lib/paymenku";
import { markOrderPaid, markOrderTerminalStatus } from "../../../../services/orderService";

const MAX_WEBHOOK_BODY_BYTES = 32 * 1024;

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const bodySize = Buffer.byteLength(rawBody, "utf8");
  const signature =
    request.headers.get("x-paymenku-signature") ||
    request.headers.get("x-paymenku-signature".toLowerCase()) ||
    "";
  const timestamp =
    request.headers.get("x-paymenku-timestamp") ||
    request.headers.get("x-paymenku-timestamp".toLowerCase()) ||
    "";

  if (bodySize > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const isValid = await verifyPaymenkuWebhookSignature(rawBody, timestamp, signature);

  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const payload = safeParseJson(rawBody);
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
    const status = extractStatus(payload);
    const referenceId = stringValue(payload?.reference_id);

    if (!referenceId) {
      throw new Error("reference_id tidak ada di payload");
    }

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
      rawJson: rawBody,
    };

    if (status === "paid") {
      await markOrderPaid(referenceId, updatePayload);
    } else if (status === "expired") {
      await markOrderTerminalStatus(referenceId, OrderStatus.EXPIRED, updatePayload);
    } else if (status === "failed") {
      await markOrderTerminalStatus(referenceId, OrderStatus.FAILED, updatePayload);
    } else if (status === "cancelled") {
      await markOrderTerminalStatus(referenceId, OrderStatus.CANCELLED, updatePayload);
    } else if (status === "refunded") {
      await markOrderTerminalStatus(referenceId, OrderStatus.REFUNDED, updatePayload);
    }

    await prisma.paymentWebhookLog.update({
      where: { id: log.id },
      data: {
        processedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing gagal" },
      { status: 400 },
    );
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

function extractStatus(data: unknown) {
  const candidates = [
    stringValue((data as Record<string, unknown> | null)?.transaction_status),
    stringValue(
      ((data as Record<string, unknown> | null)?.payment_info as Record<string, unknown> | undefined)
        ?.transaction_status,
    ),
    stringValue((data as Record<string, unknown> | null)?.status),
    stringValue(
      ((data as Record<string, unknown> | null)?.data as Record<string, unknown> | undefined)
        ?.transaction_status,
    ),
    stringValue(
      ((data as Record<string, unknown> | null)?.data as Record<string, unknown> | undefined)
        ?.status,
    ),
    stringValue(
      (
        (((data as Record<string, unknown> | null)?.data as Record<string, unknown> | undefined)
          ?.payment_info as Record<string, unknown> | undefined)
      )?.transaction_status,
    ),
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
