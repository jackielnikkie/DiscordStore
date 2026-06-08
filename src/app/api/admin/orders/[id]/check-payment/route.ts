import { NextRequest, NextResponse } from "next/server";

import { jsonError, requireAdminApi } from "../../../../../../lib/admin-api";
import { checkOrderPaymentStatus } from "../../../../../../services/paymentService";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const item = await checkOrderPaymentStatus(id);
    return NextResponse.json({ item });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Check payment gagal");
  }
}
