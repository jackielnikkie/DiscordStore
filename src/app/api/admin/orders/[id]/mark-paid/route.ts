import { NextRequest, NextResponse } from "next/server";

import { jsonError, requireAdminApi } from "../../../../../../lib/admin-api";
import { prisma } from "../../../../../../lib/db";
import { markOrderPaid } from "../../../../../../services/orderService";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const order = await prisma.order.findUnique({ where: { id } });

    if (!order) {
      return jsonError("Order tidak ditemukan", 404);
    }

    const item = await markOrderPaid(order.referenceId, {
      status: "paid",
      rawJson: JSON.stringify({ manual: true }),
    });
    return NextResponse.json({ item });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Mark paid gagal");
  }
}
