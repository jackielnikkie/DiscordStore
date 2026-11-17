const BULLET = "•";

/**
 * Mask stock content: keep first 2 and last 2 chars, hide the middle.
 * Values with 6 or fewer chars are fully masked so short secrets never leak.
 */
export function maskStockContent(value: string): string {
  const text = String(value ?? "");

  if (text.length <= 6) {
    return BULLET.repeat(text.length);
  }

  return `${text.slice(0, 2)}${BULLET.repeat(text.length - 4)}${text.slice(-2)}`;
}

/** Split comma/newline/whitespace separated ids, dedupe, cap at 200. */
export function parseStockIds(raw: string): string[] {
  const ids = String(raw ?? "")
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean);

  return Array.from(new Set(ids)).slice(0, 200);
}
