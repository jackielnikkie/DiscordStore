import { NextRequest, NextResponse } from "next/server";

import { logoutAdmin } from "../../../../lib/auth";
import { requireSameOriginApi } from "../../../../lib/admin-api";

export async function POST(request: NextRequest) {
  const originError = requireSameOriginApi(request);
  if (originError) return originError;

  await logoutAdmin();
  return NextResponse.json({ ok: true });
}
