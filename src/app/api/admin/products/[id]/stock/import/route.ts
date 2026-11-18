import { NextRequest, NextResponse } from "next/server";

import { jsonError, requireAdminApi } from "../../../../../../../lib/admin-api";
import { prisma } from "../../../../../../../lib/db";
import { requestEmbedSync } from "../../../../../../../lib/settings";
import { stockImportSchema } from "../../../../../../../lib/validators";

const MAX_IMPORT_BODY_BYTES = 1024 * 1024;
const MAX_IMPORT_LINES = 5000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(request);
  if (authError) return authError;

  // Batasi ukuran body sebelum dibaca penuh (shim SQLite 1 proses).
  if (Number(request.headers.get("content-length") || 0) > MAX_IMPORT_BODY_BYTES) {
    return jsonError("Payload import terlalu besar (maks 1 MB)", 413);
  }

  const rawBody = await readBodyLimited(request, MAX_IMPORT_BODY_BYTES);

  if (rawBody === null) {
    return jsonError("Payload import terlalu besar (maks 1 MB)", 413);
  }

  let body: unknown;

  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonError("Body import harus JSON", 400);
  }

  try {
    const { id } = await params;
    const parsed = stockImportSchema.parse({
      ...(body as Record<string, unknown>),
      productId: id,
    });
    const lines = parsed.lines
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length > MAX_IMPORT_LINES) {
      return jsonError(`Maksimal ${MAX_IMPORT_LINES} baris per import`, 413);
    }

    await prisma.stockItem.createMany({
      data: lines.map((content) => ({
        productId: parsed.productId,
        content,
      })),
    });
    await requestEmbedSync();
    return NextResponse.json({ ok: true, count: lines.length });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Import stok gagal");
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
