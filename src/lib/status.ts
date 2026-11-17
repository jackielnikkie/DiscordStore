export function formatRelativeTime(value?: string | null, now = Date.now()) {
  if (!value) {
    return "belum pernah";
  }

  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return value;
  }

  const diff = Math.max(0, now - timestamp);

  if (diff < 10_000) return "baru saja";
  if (diff < 60_000) return `${Math.floor(diff / 1000)} detik lalu`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} menit lalu`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} jam lalu`;

  return `${Math.floor(diff / 86_400_000)} hari lalu`;
}

export function isFresh(value: string | null | undefined, maxAgeMs: number, now = Date.now()) {
  if (!value) {
    return false;
  }

  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return false;
  }

  return now - timestamp < maxAgeMs;
}
