import { NextRequest, NextResponse } from "next/server";

import { jsonError, requireAdminApi } from "../../../../../lib/admin-api";
import { detectPaymenkuMode, getPaymentSettings } from "../../../../../lib/settings";

export async function POST(request: NextRequest) {
  const authError = await requireAdminApi(request);
  if (authError) return authError;

  try {
    const settings = await getPaymentSettings();
    const mode = detectPaymenkuMode(settings.paymenkuApiKey);

    if (mode === "unknown") {
      return jsonError("API key belum valid", 400);
    }

    return NextResponse.json({ ok: true, mode });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Test Paymenku gagal");
  }
}
