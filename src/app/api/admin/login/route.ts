import { NextRequest, NextResponse } from "next/server";

import {
  AdminAuthRateLimitError,
  getClientIp,
  loginAdmin,
} from "../../../../lib/auth";
import { jsonError, requireSameOriginApi } from "../../../../lib/admin-api";
import { loginSchema } from "../../../../lib/validators";

export async function POST(request: NextRequest) {
  try {
    const originError = requireSameOriginApi(request);
    if (originError) return originError;

    const body = await request.json();
    const input = loginSchema.parse(body);
    const ipAddress = getClientIp(request);
    const result = await loginAdmin(input.username, input.password, ipAddress);

    if (!result.success) {
      return jsonError(result.message, 401);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AdminAuthRateLimitError) {
      return jsonError(error.message, error.status);
    }

    return jsonError(error instanceof Error ? error.message : "Login gagal");
  }
}
