import { NextRequest, NextResponse } from "next/server";

import { jsonError, requireAdminApi } from "../../../../../../lib/admin-api";
import { prisma } from "../../../../../../lib/db";
import { requestEmbedSync } from "../../../../../../lib/settings";
import { stockAddSchema } from "../../../../../../lib/validators";

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

  try {
    const { id } = await params;
    const parsed = stockAddSchema.parse({
      ...(await request.json()),
      productId: id,
    });
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
