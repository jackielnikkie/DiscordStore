import { NextRequest, NextResponse } from "next/server";

import { jsonError, requireAdminApi } from "../../../../../../../lib/admin-api";
import { prisma } from "../../../../../../../lib/db";
import { requestEmbedSync } from "../../../../../../../lib/settings";
import { stockImportSchema } from "../../../../../../../lib/validators";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const parsed = stockImportSchema.parse({
      ...(await request.json()),
      productId: id,
    });
    const lines = parsed.lines
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
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
