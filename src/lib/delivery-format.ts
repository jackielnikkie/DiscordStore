export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const STOCK_TOKEN = "@@STOCK_BLOCK@@";

/** Format daftar stok jadi blok yang bisa di-copy sekali tap/klik. */
export function formatStockBlock(platform: string, lines: string[]) {
  const clean = lines.filter((line) => line.trim().length > 0);

  if (platform === "telegram") {
    return clean.map((line) => `<code>${escapeHtml(line)}</code>`).join("\n");
  }

  return ["```", ...clean, "```"].join("\n");
}

/**
 * Render template DM + blok stok. Telegram pakai HTML (<code> = tap to copy),
 * Discord pakai code fence.
 */
export function renderDeliveryMessage(
  template: string,
  context: Record<string, string | number>,
  platform: string,
  stockLines: string[],
) {
  const raw = template.replace(/\{\{\s*stockLines\s*\}\}/g, STOCK_TOKEN);
  const rendered = raw.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const value = context[key];
    return value === undefined || value === null ? "" : String(value);
  });

  if (platform === "telegram") {
    return escapeHtml(rendered).replace(STOCK_TOKEN, formatStockBlock(platform, stockLines));
  }

  return rendered.replace(STOCK_TOKEN, formatStockBlock(platform, stockLines));
}

export function buildDeliveryFileName(referenceId: string) {
  return `order-${referenceId.replace(/[^A-Za-z0-9-]/g, "")}.txt`;
}

export function buildDeliveryFileContent(referenceId: string, lines: string[]) {
  return [
    `Order: ${referenceId}`,
    `Tanggal: ${new Date().toISOString()}`,
    "",
    ...lines,
    "",
  ].join("\n");
}
