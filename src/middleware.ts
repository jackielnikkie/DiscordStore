import { NextRequest, NextResponse } from "next/server";

// Must stay in sync with SESSION_COOKIE in src/lib/auth.ts.
// Duplicated instead of imported because auth.ts pulls in bcryptjs/prisma,
// which are not Edge-runtime compatible. Keep this dependency-free.
const SESSION_COOKIE = "discordstore_admin";

// Paths under /admin or /api/admin that must stay open without a session.
const PUBLIC_PATHS = new Set(["/admin/login", "/api/admin/login", "/api/admin/logout"]);

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isApi = pathname === "/api/admin" || pathname.startsWith("/api/admin/");
  const isPage = pathname === "/admin" || pathname.startsWith("/admin/");

  if (!isApi && !isPage) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  if (request.cookies.get(SESSION_COOKIE)?.value) {
    return NextResponse.next();
  }

  if (isApi) {
    const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("error", "session_expired");
  if (search) {
    loginUrl.searchParams.set("next", `${pathname}${search}`);
  }
  return NextResponse.redirect(loginUrl);
}

// Scoped to the admin surface only. _next/static, _next/image and favicon.ico
// never match these sources, so they are implicitly excluded.
export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
