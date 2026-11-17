import crypto from "node:crypto";

let cachedSessionSecret: string | null = null;

/**
 * Lazy: build `next build` jalan tanpa SESSION_SECRET, jadi jangan throw di module scope.
 */
function getSessionSecret() {
  if (cachedSessionSecret) {
    return cachedSessionSecret;
  }

  const fromEnv = process.env.SESSION_SECRET?.trim();

  if (!fromEnv && process.env.NODE_ENV === "production") {
    // Jangan throw: `next build` juga berjalan dengan NODE_ENV=production tanpa env runtime.
    console.warn(
      "[security] SESSION_SECRET kosong di production — sesi admin tidak stabil antar restart.",
    );
  }

  cachedSessionSecret = fromEnv || crypto.randomBytes(32).toString("hex");
  return cachedSessionSecret;
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
