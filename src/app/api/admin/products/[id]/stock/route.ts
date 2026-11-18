import { NextRequest, NextResponse } from "next/server";

import { jsonError, requireAdminApi } from "../../../../../../lib/admin-api";
import { prisma } from "../../../../../../lib/db";
import { requestEmbedSync } from "../../../../../../lib/settings";
import { stockAddSchema } from "../../../../../../lib/validators";

const MAX_STOCK_BODY_BYTES = 64 * 1024;
const MAX_STOCK_CONTENT_BYTES = 16 * 1024;
const MAX_STOCK_LINES = 200;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi();
  if (authError) return authError;

  const { id } = await params;
  const items = await prisma.stockItem.findMany({
    where: { productId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ items });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(request);
  if (authError) return authError;

  if (Number(request.headers.get("content-length") || 0) > MAX_STOCK_BODY_BYTES) {
    return jsonError("Payload stok terlalu besar", 413);
  }

  const rawBody = await readBodyLimited(request, MAX_STOCK_BODY_BYTES);

  if (rawBody === null) {
    return jsonError("Payload stok terlalu besar", 413);
  }

  let body: unknown;

  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonError("Body stok harus JSON", 400);
  }

  try {
    const { id } = await params;
    const parsed = stockAddSchema.parse({
      ...(body as Record<string, unknown>),
      productId: id,
    });

    if (Buffer.byteLength(parsed.content, "utf8") > MAX_STOCK_CONTENT_BYTES) {
      return jsonError("Isi stok terlalu besar (maks 16 KB)", 413);
    }

    const lineCount = parsed.content.split(/\r?\n/).filter((line) => line.trim()).length;

    if (lineCount > MAX_STOCK_LINES) {
      return jsonError(`Maksimal ${MAX_STOCK_LINES} baris per item stok`, 413);
    }

    const item = await prisma.stockItem.create({
      data: {
        productId: parsed.productId,
        content: parsed.content,
      },
    });
    await requestEmbedSync();
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Tambah stok gagal");
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
