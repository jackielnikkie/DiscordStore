import crypto from "node:crypto";

const sessionSecret =
  process.env.SESSION_SECRET?.trim() || crypto.randomBytes(32).toString("hex");

export function randomToken(size = 48) {
  return crypto.randomBytes(size).toString("hex");
}

export function hashSessionToken(token: string) {
  return crypto
    .createHmac("sha256", sessionSecret)
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
