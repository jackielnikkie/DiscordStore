import { NextRequest, NextResponse } from "next/server";

import { jsonError, requireAdminApi } from "../../../../lib/admin-api";
import {
  getAllSettings,
  getMaskedSettingsSnapshot,
  saveBotSettings,
  savePaymentSettings,
  saveTextSettings,
} from "../../../../lib/settings";
import {
  botSettingsSchema,
  paymentSettingsSchema,
  textSettingsSchema,
} from "../../../../lib/validators";

export async function GET() {
  const authError = await requireAdminApi();
  if (authError) return authError;

  const settings = await getAllSettings();
  return NextResponse.json({ item: getMaskedSettingsSnapshot(settings) });
}

export async function PATCH(request: NextRequest) {
  const authError = await requireAdminApi(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as {
      bot?: Record<string, string | boolean>;
      payment?: Record<string, string | boolean>;
      text?: Record<string, string | boolean>;
    };

    if (body.bot) {
      await saveBotSettings(botSettingsSchema.partial().parse(body.bot), {
        preserveSecrets: true,
      });
    }

    if (body.payment) {
      await savePaymentSettings(paymentSettingsSchema.partial().parse(body.payment), {
        preserveSecrets: true,
      });
    }

    if (body.text) {
      await saveTextSettings(textSettingsSchema.partial().parse(body.text));
    }

    const settings = await getAllSettings();
    return NextResponse.json({ item: getMaskedSettingsSnapshot(settings) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Update settings gagal");
  }
}
