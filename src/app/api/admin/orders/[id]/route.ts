import { NextRequest, NextResponse } from "next/server";

import { jsonError, requireAdminApi } from "../../../../../lib/admin-api";
import { prisma } from "../../../../../lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi();
  if (authError) return authError;

  const { id } = await params;
  const item = await prisma.order.findUnique({
    where: { id },
    include: {
      product: true,
      soldStocks: true,
      reservedStocks: true,
    },
  });

  if (!item) {
    return jsonError("Order tidak ditemukan", 404);
  }

  return NextResponse.json({ item });
}
