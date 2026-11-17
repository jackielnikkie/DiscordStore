import { NextRequest, NextResponse } from "next/server";

import { getAdminSession } from "./auth";

export async function requireAdminApi(request?: NextRequest) {
  const session = await getAdminSession();

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
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
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function validateSameOrigin(request: NextRequest) {
  const method = request.method.toUpperCase();

  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null;
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  // Reject when a candidate is present but its host does not match this app.
  const candidates = [origin, referer].filter((value): value is string => Boolean(value));

  if (candidates.length === 0) {
    return jsonError("Origin header required", 403);
  }

  const allowedHosts = getAllowedHosts(request);

  if (allowedHosts.size === 0) {
    return jsonError("Host header required", 403);
  }

  for (const candidate of candidates) {
    let candidateHost: string;

    try {
      candidateHost = new URL(candidate).host.toLowerCase();
    } catch {
      return jsonError("Cross-site request blocked", 403);
    }

    if (!allowedHosts.has(candidateHost)) {
      return jsonError("Cross-site request blocked", 403);
    }
  }

  return null;
}

function getAllowedHosts(request: NextRequest): Set<string> {
  const hosts = new Set<string>();

  const requestHost =
    request.headers.get("x-forwarded-host") || request.headers.get("host");

  if (requestHost) {
    hosts.add(requestHost.split(",")[0].trim().toLowerCase());
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (appUrl) {
    try {
      hosts.add(new URL(appUrl).host.toLowerCase());
    } catch {
      // Ignore malformed NEXT_PUBLIC_APP_URL; request host still applies.
    }
  }

  return hosts;
}
