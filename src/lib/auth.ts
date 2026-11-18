import { compareSync, hashSync } from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  hashSessionToken,
  randomToken,
  signSessionToken,
  timingSafeCompare,
} from "./crypto";
import { prisma } from "./db";

const SESSION_COOKIE_BASE = "discordstore_admin";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
// `__Host-` hanya valid bila Secure + Path=/ + tanpa Domain (dipenuhi di setSessionCookie).
const SESSION_COOKIE = IS_PRODUCTION
  ? `__Host-${SESSION_COOKIE_BASE}`
  : SESSION_COOKIE_BASE;
// src/middleware.ts memakai nama cookie yang sama (hardcode, tidak boleh impor
// file ini karena menarik bcryptjs/prisma yang tidak kompatibel Edge runtime).
const SESSION_COOKIE_VERSION = "v1";
const SESSION_DURATION_DAYS = 7;
const SESSION_IDLE_MS = 60 * 60 * 1000;
// Cost-12 bcrypt hash of a throwaway string. Used to burn the same CPU time when
// the username is wrong or no hash is configured, so response timing cannot be
// used to enumerate valid usernames.
const DUMMY_PASSWORD_HASH =
  "$2b$12$T5Gm3sOu7TrDh7joqb0age57C5WfNDE/tvB/AEnuYAN8kumtCihT2";
export const ADMIN_PASSWORD_MIN_LENGTH = 8;
const ADMIN_PASSWORD_HASH_SETTING_KEY = "env__admin_password_hash";
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
// ponytail: counter in-memory hilang saat restart; upgrade ke SQLite kalau brute force nyata.
const LOGIN_RATE_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_LIMITS = {
  ip: 5,
  username: 8,
  global: 30,
} as const;

export class AdminAuthRateLimitError extends Error {
  status = 429;
}

async function getAdminPasswordHash(): Promise<string | null> {
  const envHash = process.env.ADMIN_PASSWORD_HASH?.trim();

  if (envHash) {
    return envHash;
  }

  const existing = await prisma.setting.findMany({
    where: { key: ADMIN_PASSWORD_HASH_SETTING_KEY },
  });

  const storedHash = existing.find((s) => s.key === ADMIN_PASSWORD_HASH_SETTING_KEY);

  return storedHash?.value?.trim() || null;
}

async function setAdminSetting(key: string, value: string) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    update: { value, updatedAt: new Date().toISOString() },
  });
}

function getAdminUsername() {
  return process.env.ADMIN_USERNAME || "admin";
}

export function getClientIpFromHeaders(headers: Headers): string {
  // Caddy menambahkan hop klien asli di ujung kanan X-Forwarded-For; hop paling
  // kiri dikendalikan klien. Ambil hop terakhir, jangan percaya X-Real-IP mentah.
  const forwarded = headers.get("x-forwarded-for");

  if (!forwarded) {
    return "unknown";
  }

  const hops = forwarded
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);

  return hops[hops.length - 1] || "unknown";
}

export function getClientIp(request: { headers: Headers }): string {
  return getClientIpFromHeaders(request.headers);
}

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function encodeSessionCookie(rawToken: string, lastSeenAt: number) {
  const payload = `${SESSION_COOKIE_VERSION}.${rawToken}.${lastSeenAt}`;
  return `${payload}.${signSessionToken(payload)}`;
}

function decodeSessionCookie(value: string) {
  const parts = value.split(".");

  if (parts.length !== 4) {
    return null;
  }

  const [version, rawToken, lastSeen, signature] = parts;

  if (version !== SESSION_COOKIE_VERSION || !rawToken || !lastSeen) {
    return null;
  }

  const lastSeenAt = Number(lastSeen);

  if (!Number.isFinite(lastSeenAt)) {
    return null;
  }

  const payload = `${version}.${rawToken}.${lastSeen}`;

  if (!timingSafeCompare(signSessionToken(payload), signature)) {
    return null;
  }

  return { rawToken, lastSeenAt };
}

function setSessionCookie(
  cookieStore: CookieStore,
  rawToken: string,
  expiresAt: Date,
) {
  cookieStore.set({
    name: SESSION_COOKIE,
    value: encodeSessionCookie(rawToken, Date.now()),
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    expires: expiresAt,
  });
}

function refreshSessionCookie(
  cookieStore: CookieStore,
  rawToken: string,
  expiresAt: Date,
) {
  try {
    setSessionCookie(cookieStore, rawToken, expiresAt);
  } catch {
    // Server Component tidak boleh set cookie; sliding tetap terjadi pada
    // Server Action / Route Handler berikutnya. Idle timeout tetap berlaku.
  }
}

async function readAdminSession(allowCookieRefresh: boolean) {
  const cookieStore = await cookies();
  const decoded = decodeSessionCookie(
    cookieStore.get(SESSION_COOKIE)?.value ?? "",
  );

  if (!decoded) {
    return null;
  }

  const now = Date.now();

  if (now - decoded.lastSeenAt > SESSION_IDLE_MS) {
    return null;
  }

  const tokenHash = hashSessionToken(decoded.rawToken);
  const session = await prisma.adminSession.findUnique({ where: { tokenHash } });

  if (!session) {
    return null;
  }

  const expiresAt = new Date(session.expiresAt);

  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < now) {
    return null;
  }

  if (allowCookieRefresh) {
    refreshSessionCookie(cookieStore, decoded.rawToken, expiresAt);
  }

  return {
    username: getAdminUsername(),
    expiresAt: session.expiresAt,
  };
}

export async function getAdminSession() {
  return readAdminSession(true);
}

export async function requireAdminSession() {
  // Server-safe version without cookie mutation
  const session = await readAdminSession(false).catch(() => null);

  if (!session) {
    redirect("/admin/login");
  }

  return session;
}

export async function loginAdmin(
  username: string,
  password: string,
  ipAddress = "unknown",
) {
  enforceRateLimit(username, ipAddress);

  const validUsername = username === getAdminUsername();
  const storedHash = await getAdminPasswordHash();

  // Always run a cost-12 bcrypt compare against a real hash (the stored one when
  // everything lines up, otherwise the dummy) so the failure path costs the same
  // as the success path — no timing leak of username existence or config state.
  const hashToCheck = validUsername && storedHash ? storedHash : DUMMY_PASSWORD_HASH;
  const validPassword =
    validUsername && Boolean(storedHash) && compareSync(password, hashToCheck);

  if (!validPassword) {
    registerLoginFailure(username, ipAddress);
    // Single generic message for every failure mode (wrong user, wrong password,
    // or unconfigured hash) to avoid account/config enumeration.
    return { success: false as const, message: "Username atau password salah" };
  }

  clearLoginFailures(username, ipAddress);
  await prisma.adminSession.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  await createAdminSession();

  return { success: true as const };
}

export async function logoutAdmin() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE)?.value;
  const decoded = rawToken ? decodeSessionCookie(rawToken) : null;

  if (decoded) {
    await prisma.adminSession
      .delete({
        where: { tokenHash: hashSessionToken(decoded.rawToken) },
      })
      .catch(() => null);
  }

  cookieStore.delete(SESSION_COOKIE);
}

export async function changeAdminPasswordAction(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (process.env.ADMIN_PASSWORD_HASH?.trim()) {
      throw new Error(
        "Password dikelola lewat ADMIN_PASSWORD_HASH dan tidak bisa diubah dari panel.",
      );
    }

    const storedHash = await getAdminPasswordHash();

    if (!storedHash) {
      throw new Error("Password admin belum dikonfigurasi");
    }

    if (!compareSync(currentPassword, storedHash)) {
      throw new Error("Password saat ini salah");
    }

    if (!newPassword || newPassword.length < ADMIN_PASSWORD_MIN_LENGTH) {
      throw new Error(
        `Password baru minimal ${ADMIN_PASSWORD_MIN_LENGTH} karakter`,
      );
    }

    if (compareSync(newPassword, storedHash)) {
      throw new Error("Password baru harus berbeda dari password saat ini");
    }

    const newHash = hashSync(newPassword, 12);
    await setAdminSetting(ADMIN_PASSWORD_HASH_SETTING_KEY, newHash);
    await prisma.adminSession.deleteMany({});
    await createAdminSession();

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Gagal mengubah password",
    };
  }
}

async function createAdminSession() {
  const rawToken = randomToken();
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000,
  );

  await prisma.adminSession.create({
    data: {
      tokenHash,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  setSessionCookie(cookieStore, rawToken, expiresAt);
}

function enforceRateLimit(username: string, ipAddress: string) {
  purgeExpiredLoginAttempts();

  const checks: Array<[string, number]> = [
    [buildRateLimitKey("ip", ipAddress), LOGIN_LIMITS.ip],
    [buildRateLimitKey("username", username), LOGIN_LIMITS.username],
    [buildRateLimitKey("global", "all"), LOGIN_LIMITS.global],
  ];

  for (const [key, limit] of checks) {
    const entry = loginAttempts.get(key);

    if (entry && entry.count >= limit) {
      throw new AdminAuthRateLimitError(
        "Terlalu banyak percobaan login. Coba lagi sebentar.",
      );
    }
  }
}

function registerLoginFailure(username: string, ipAddress: string) {
  bumpLoginAttempt(buildRateLimitKey("ip", ipAddress));
  bumpLoginAttempt(buildRateLimitKey("username", username));
  bumpLoginAttempt(buildRateLimitKey("global", "all"));
}

function clearLoginFailures(username: string, ipAddress: string) {
  loginAttempts.delete(buildRateLimitKey("ip", ipAddress));
  loginAttempts.delete(buildRateLimitKey("username", username));
}

function buildRateLimitKey(scope: "ip" | "username" | "global", value: string) {
  return `${scope}:${value.trim().toLowerCase() || "unknown"}`;
}

function bumpLoginAttempt(key: string) {
  const existing = loginAttempts.get(key);

  if (!existing || Date.now() > existing.resetAt) {
    loginAttempts.set(key, {
      count: 1,
      resetAt: Date.now() + LOGIN_RATE_WINDOW_MS,
    });
    return;
  }

  existing.count += 1;
  loginAttempts.set(key, existing);
}

function purgeExpiredLoginAttempts() {
  const now = Date.now();

  for (const [key, value] of loginAttempts.entries()) {
    if (value.resetAt <= now) {
      loginAttempts.delete(key);
    }
  }
}
