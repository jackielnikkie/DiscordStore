import { NextRequest, NextResponse } from "next/server";

import { jsonError, requireAdminApi } from "../../../../../lib/admin-api";
import { testDiscordConnection } from "../../../../../lib/discord";

export async function POST(request: NextRequest) {
  const authError = await requireAdminApi(request);
  if (authError) return authError;

  try {
    const result = await testDiscordConnection();
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Test Discord gagal");
  }
}
