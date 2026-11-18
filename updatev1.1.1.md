# Update v1.1.1 — Hardening keamanan (checklist audit v1.1.0)

Status: **implemented** (versi `1.1.1`, tampil di sidebar: `Admin Panel · v1.1.1`)
Sumber: `docs/security-audit-v1.1.0.md` → checklist "Hardening checklist v1.1.1".

## Ringkasan
Dirilis tanpa perubahan fitur user-facing. Semua item checklist dikerjakan atau
dibatalkan dengan alasan.

## 1. Dependency (SEC-03)
- `next ^15.1.8 → ^15.5.29`, `zod ^4.1.5 → ^4.6.7`, `discord.js ^14.26.2 → ^14.28.1`,
  `concurrently ^9.2.1 → ^9.2.5`, `bcryptjs ^3.0.2 → ^3.0.3`.
- `cn@0.1.1` **sudah tidak ada** di `package.json`/`package-lock.json` sebelum rilis ini
  (temuan audit sudah stale). Tidak ada import `cn` (diverifikasi).
- Gate CI baru: `.github/workflows/docker.yml` menjalankan
  `npm audit --omit=dev --audit-level=critical` (tanpa `continue-on-error`) sebelum build image.

## 2. Injeksi konten ke Discord/embed (SEC-05, SEC-13)
- `src/lib/discord.ts`: helper `withSafeMentions` — semua kirim ke channel memakai
  `allowedMentions: { parse: [] }` (string payload diubah jadi objek; objek yang sudah
  punya `allowedMentions` dibiarkan). Hapus permukaan `@everyone`/`@here`/role ping.
- `src/bot/services/buyAlert.ts`: `sanitizeTelegramName` untuk nama buyer Telegram —
  buang karakter kontrol, netralkan `@everyone`/`@here`/`@&`, buang backtick, cap 64 char.
- `src/bot/services/embedSync.ts`: `sanitizeEmbedText` untuk nama/deskripsi/format produk
  dan label tombol (kontrol char, backtick → `’`, truncate sesuai batas embed).
- Tiga page admin yang menampilkan data tak-terpercaya **sudah** render sebagai teks React;
  tidak ada `dangerouslySetInnerHTML` di `src` (grep global) — tidak ada perubahan.
- Stok tetap `maskStockContent` di HTML (aturan owner).

## 3. Abuse / order spam (SEC-11)
- `src/bot/telegram/handlers.ts` + `src/bot/handlers/interactionCreate.ts`:
  `clampQuantity` menolak qty non-finite, `< 1`, atau melebihi cap (`MAX_ORDER_QTY = 100`;
  `STOCK_LINE` dibatasi `availableStockCount`; `CUSTOM_TEXT` cap 100 tanpa cek stok by design).
- Cooldown order per `(platform, userId)` = 20 detik, `Map` in-memory.
  `// ponytail: in-memory, hilang saat restart` — naikkan ke tabel SQLite kalau spam nyata.

## 4. Body-size limit (SEC-04)
| Endpoint | Content-Length | Byte cap stream | Baris |
|---|---|---|---|
| `POST /api/webhooks/paymenku` | 32 KB | 32 KB (`readBodyLimited`) | — |
| `POST /api/admin/products/[id]/stock/import` | 1 MB | 1 MB | 5000 |
| `POST /api/admin/products/[id]/stock` | 64 KB | 64 KB | 200 (16 KB/isi) |

Lewat batas → `413`. `readBodyLimited` membaca `request.body` via `getReader()`,
`reader.cancel()` saat cap terlampaui (tidak buffering penuh sebelum cek).

## 5. Login rate limit (SEC-01, SEC-02)
- `src/lib/auth.ts`: helper tunggal `getClientIp(request)` / `getClientIpFromHeaders(headers)`
  dipakai route API login **dan** server action login. IP = hop **terakhir** `X-Forwarded-For`
  (yang ditambahkan Caddy), bukan hop pertama yang bisa dipalsukan klien. Kosong → `"unknown"`.
- Counter tetap in-memory (fast-path) + komentar ponytail untuk upgrade ke SQLite.
- **`rate_limit` Caddy DIBATALKAN**: bukan direktif bawaan; butuh module `caddy-ratelimit`
  (build xcaddy) yang tidak ada di `caddy:2-alpine` → Caddy akan gagal start.
  Alasan ditulis sebagai komentar di `Caddyfile`.

## 6. SESSION_SECRET fail-fast (SEC-07)
- `src/lib/crypto.ts`: `NODE_ENV === "production"` + secret kosong/<32 char +
  `NEXT_PHASE !== "phase-production-build"` → `throw` saat fungsi dipanggil (runtime),
  bukan di module scope, supaya `next build` tetap jalan tanpa env runtime.
- Non-production tetap fallback random + warning. Nilai secret tidak pernah di-log.

## 7. Cookie sesi (SEC-08)
- Production: nama cookie `__Host-discordstore_admin` (Secure + Path=/ + tanpa Domain);
  development: `discordstore_admin`.
- Token kini payload bertanda tangan HMAC: `v1.<rawToken>.<lastSeenEpochMs>.<hmac>`.
  Token lama/tak valid → `null` = belum login (tanpa 500).
- Idle timeout 60 menit dari `lastSeenAt` (sliding, cookie di-refresh saat validasi sukses),
  absolute tetap 7 hari dari DB `expiresAt`.
- `src/middleware.ts` disesuaikan memakai nama berversi (`__Host-` di production) sehingga
  tidak ada redirect-loop; marker cookie workaround dihapus.
- **Efek operasional saat deploy**: nama cookie berubah → semua sesi admin lama invalid.
  Login ulang sekali. Ini disengaja.

## 8. Log webhook (SEC-09)
- Hanya header allowlist yang disimpan: `content-type`, `user-agent`, semua `x-paymenku-*`.
- Header yang namanya cocok `/(signature|authorization|cookie|token|secret|api-?key)/i`
  → `"[redacted]"`.
- TTL: `pruneWebhookLogs()` di poller (tiap 180 s, best-effort) hapus
  `PaymentWebhookLog` lebih lama dari 30 hari. Primitive `prisma.paymentWebhookLog.deleteMany`
  ditambahkan ke `src/lib/db.ts` (butuh `where`, tanpa `where` → error).

## 9. Webhook durable (SEC-10)
- `after()` dihapus: `processPayload` di-`await` **sebelum** 2xx, jadi crash = tanpa ack =
  provider retry. Gagal → `503`; non-retryable (`Order tidak ditemukan`, `reference_id` kosong)
  → `400`; log tetap tersimpan (`processedAt = null`).
- Backstop: poller tetap merekonsiliasi order `PENDING` lewat `checkOrderPaymentStatus`
  → `markOrderPaid` (idempoten) ⇒ webhook gagal tetap terselamatkan ≤180 s.
- HMAC-SHA256 (`timestamp.body`, toleransi 5 menit, `timingSafeEqual`) tidak disentuh.

## 10. SQL identifier whitelist (SEC-06)
- `src/lib/db.ts`: map `TABLE_COLUMNS` per tabel + helper `column(table, key)` dan
  `orderDirection(value)` (hanya `ASC`/`DESC`).
- Diterapkan di `buildSelect`, `buildOrderBy`, `buildProductOrder`, `appendWhere`
  (kini butuh param `table`), `findUnique` (Product/Order), `groupBy` (StockItem/Order),
  dan `_sum` aggregate.
- Identifier tak dikenal → `throw` (bukan diabaikan) supaya bug tidak berubah jadi query liar.
- Tambah kolom baru via `ensureColumn` ⇒ **wajib** tambahkan juga ke `TABLE_COLUMNS`.

## 11. Verifikasi
`npx tsc --noEmit` bersih · `npx tsx scripts/selfcheck.mts` ok · `npm run build` sukses ·
`npm install` (lockfile ikut ter-update).

## 12. Sisa / belum dikerjakan
- Rate limit di edge (Caddy) belum ada — hanya app-level. Tambah kalau brute force nyata:
  build Caddy dengan `xcaddy + caddy-ratelimit`, atau persist counter ke SQLite.
- Rekonsiliasi berbasis `PaymentWebhookLog.processedAt = null` (butuh `findMany` di shim)
  belum perlu karena webhook sudah sinkron + backstop PENDING.
- `script-src` CSP masih `unsafe-inline` (butuh hydration Next); nonce belum dipasang.
