export function formatRupiah(amount?: number | null) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount ?? 0);
}

export function parseMoney(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(/[^\d.,-]/g, "");

    if (!normalized) {
      return fallback;
    }

    const lastDot = normalized.lastIndexOf(".");
    const lastComma = normalized.lastIndexOf(",");
    const decimalIndex = Math.max(lastDot, lastComma);

    let candidate = normalized;

    if (decimalIndex >= 0) {
      const fractionLength = normalized.length - decimalIndex - 1;
      const decimalSeparator = normalized[decimalIndex];

      if (fractionLength > 0 && fractionLength <= 2) {
        const thousandsSeparator = decimalSeparator === "." ? /,/g : /\./g;
        candidate = normalized
          .replace(thousandsSeparator, "")
          .replace(decimalSeparator, ".");
      } else {
        candidate = normalized.replace(/[.,]/g, "");
      }
    }

    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
  }

  return fallback;
}
