import crypto from "node:crypto";

let cachedSessionSecret: string | null = null;

const MIN_SESSION_SECRET_LENGTH = 32;

/**
 * Lazy: build `next build` jalan tanpa SESSION_SECRET (NODE_ENV=production), jadi
 * throw hanya saat fungsi ini dipanggil di runtime — bukan di module scope.
 */
function getSessionSecret() {
  if (cachedSessionSecret) {
    return cachedSessionSecret;
  }

  const fromEnv = process.env.SESSION_SECRET?.trim();
  const usable =
    fromEnv && fromEnv.length >= MIN_SESSION_SECRET_LENGTH ? fromEnv : null;

  if (!usable) {
    const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

    if (process.env.NODE_ENV === "production" && !isBuildPhase) {
      // Fail fast di runtime production. Nilai secret tidak pernah dicetak.
      throw new Error(
        `SESSION_SECRET wajib diisi minimal ${MIN_SESSION_SECRET_LENGTH} karakter di production.`,
      );
    }

    console.warn(
      "[security] SESSION_SECRET kosong/terlalu pendek — memakai secret acak sementara (sesi admin tidak stabil antar restart).",
    );
  }

  cachedSessionSecret = usable || crypto.randomBytes(32).toString("hex");
  return cachedSessionSecret;
}

export function signSessionToken(payload: string) {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("hex");
}

export function randomToken(size = 48) {
  return crypto.randomBytes(size).toString("hex");
}

export function hashSessionToken(token: string) {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(token)
    .digest("hex");
}

export function createWebhookSignature(
  rawBody: string,
  timestamp: string,
  secret: string,
) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

export function timingSafeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
