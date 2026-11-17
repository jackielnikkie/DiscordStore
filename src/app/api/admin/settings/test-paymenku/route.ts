import { NextRequest, NextResponse } from "next/server";

import { jsonError, requireAdminApi } from "../../../../../lib/admin-api";
import { detectPaymenkuMode, getPaymentSettings } from "../../../../../lib/settings";
import { listPaymenkuChannels } from "../../../../../lib/paymenku";

export async function POST(request: NextRequest) {
  const authError = await requireAdminApi(request);
  if (authError) return authError;

  try {
    const settings = await getPaymentSettings();
    const channels = await listPaymenkuChannels({ fresh: true });

    return NextResponse.json({
      ok: true,
      mode: detectPaymenkuMode(settings.paymenkuApiKey),
      channels: channels.length,
      selected: channels.some(
        (channel) => channel.code === settings.paymenkuChannelCode,
      ),
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Test Paymenku gagal");
  }
}
