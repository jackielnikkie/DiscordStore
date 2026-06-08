import { NextResponse } from "next/server";

import { requireAdminApi } from "../../../../lib/admin-api";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const authError = await requireAdminApi();
  if (authError) return authError;

  const items = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { product: true, soldStocks: true, reservedStocks: true },
  });
  return NextResponse.json({ items });
}
