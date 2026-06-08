import { compareSync, hashSync } from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { hashSessionToken, randomToken } from "./crypto";
import { prisma } from "./db";

const SESSION_COOKIE = "discordstore_admin";
const SESSION_DURATION_DAYS = 7;
export const ADMIN_PASSWORD_MIN_LENGTH = 8;
const ADMIN_PASSWORD_HASH_SETTING_KEY = "env__admin_password_hash";
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
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

export async function getAdminSession() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!rawToken) {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash },
  });

  if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
    return null;
  }

  return {
    username: getAdminUsername(),
    expiresAt: session.expiresAt,
  };
}

export async function requireAdminSession() {
  // Server-safe version without cookie mutation
  const session = await (async () => {
    try {
      const cookieStore = await cookies();
      const rawToken = cookieStore.get(SESSION_COOKIE)?.value;
      if (!rawToken) return null;
      const tokenHash = hashSessionToken(rawToken);
      const sess = await prisma.adminSession.findUnique({ where: { tokenHash } });
      return sess && new Date(sess.expiresAt).getTime() >= Date.now()
        ? { username: getAdminUsername(), expiresAt: sess.expiresAt }
        : null;
    } catch {
      return null;
    }
  })();

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
  const validPassword = storedHash ? compareSync(password, storedHash) : false;

  if (!storedHash) {
    registerLoginFailure(username, ipAddress);
    return {
      success: false as const,
      message: "Password admin belum dikonfigurasi. Set ADMIN_PASSWORD_HASH terlebih dahulu.",
    };
  }

  if (!validUsername || !validPassword) {
    registerLoginFailure(username, ipAddress);
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

  if (rawToken) {
    await prisma.adminSession
      .delete({
        where: { tokenHash: hashSessionToken(rawToken) },
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
  cookieStore.set({
    name: SESSION_COOKIE,
    value: rawToken,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  });
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
