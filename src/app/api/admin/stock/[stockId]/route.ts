import { NextRequest, NextResponse } from "next/server";

import { jsonError, requireAdminApi } from "../../../../../lib/admin-api";
import { prisma } from "../../../../../lib/db";
import { requestEmbedSync } from "../../../../../lib/settings";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ stockId: string }> },
) {
  const authError = await requireAdminApi(request);
  if (authError) return authError;

  try {
    const { stockId } = await params;
    await prisma.stockItem.delete({
      where: { id: stockId },
    });
    await requestEmbedSync();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Delete stock gagal");
  }
}
