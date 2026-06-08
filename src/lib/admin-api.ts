import { NextRequest, NextResponse } from "next/server";

import { getAdminSession } from "./auth";

export async function requireAdminApi(request?: NextRequest) {
  const session = await getAdminSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request) {
    const originError = validateSameOrigin(request);
    if (originError) {
      return originError;
    }
  }

  return null;
}

export function requireSameOriginApi(request: NextRequest) {
  return validateSameOrigin(request);
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function validateSameOrigin(request: NextRequest) {
  const method = request.method.toUpperCase();

  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null;
  }

  const origin = request.headers.get("origin");

  if (!origin) {
    return NextResponse.json({ error: "Origin header required" }, { status: 403 });
  }

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");

  if (!host) {
    return NextResponse.json({ error: "Host header required" }, { status: 403 });
  }

  const forwardedProto =
    request.headers.get("x-forwarded-proto") ||
    new URL(request.url).protocol.replace(":", "");
  const expectedOrigin = `${forwardedProto}://${host}`.toLowerCase();

  if (origin.toLowerCase() !== expectedOrigin) {
    return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
  }

  return null;
}
