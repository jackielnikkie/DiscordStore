# Update v1.1.0 — Stock multi-select, masking, order actions, owner store

Status: **implemented & deployed** (versi `1.1.0`, tampil di sidebar: `Admin Panel · v1.1.0`)

## 1. Stock table (Kelola Stok)
- Checkbox per baris + checkbox header (select-all halaman, indeterminate saat sebagian).
- Toolbar `{n} dipilih` → **Hapus terpilih** / Batalkan; konfirmasi menyebut "hanya stok AVAILABLE yang dihapus".
- **Pilih semua hasil filter** (`all=1`) menghapus semua `AVAILABLE` yang cocok filter.
- Hapus massal hanya `AVAILABLE`; `RESERVED`/`SOLD` dilewati dan dilaporkan (`x dihapus, y dilewati`).
- Filter status (AVAILABLE / RESERVED / SOLD / semua) + pagination 50 baris.
- Masking **server-side**: HTML hanya berisi `ab••••gh`; isi asli diambil via `POST /api/admin/stock/reveal` (auth admin + same-origin, maks 100 id).
- Tombol mata per baris, **Tampilkan semua**, **Sembunyikan semua**, dan copy per baris (aktif setelah terlihat).

## 2. Tombol aksi order (detail order)
| Tombol | Aktif saat | Perilaku |
|---|---|---|
| Resend DM Delivery | `PAID` | hasil nyata: `delivered`, `already_delivered`, `sandbox_blocked` (pesan: aktifkan toggle sandbox delivery) |
| Check Payment Status | semua | re-cek Paymenku; kalau `PAID` & belum terkirim → coba kirim ulang otomatis |
| Mark Paid Manual | bukan `PAID`/`REFUNDED` | status yang tidak berubah dilaporkan ("status tidak berubah") |
| Cancel Order | `PENDING` | best-effort `POST /transaction/cancel` ke Paymenku, lalu lokal `CANCELLED` + stok dilepas |

Tombol non-aktif tidak menghilang, hanya disabled + hint alasan. `deliveryError` ditampilkan di kotak amber.

Refund **tidak** diimplementasi (kanal QRIS tidak didukung API refund Paymenku).

## 3. Auto-cancel 10 menit
- Timeout tidak dibayar → status **`CANCELLED`** (bukan `EXPIRED`), stok `RESERVED` → `AVAILABLE`, `soldCount` tidak berubah, buyer dapat DM.
- Pemicu: worker poller tiap 3 menit, webhook `expired` Paymenku, atau cek status manual. Efektif ±10–13 menit.

## 4. Owner store
- Setting `ownerDiscord` (tanpa `@`) di Bot → Discord, validasi `^[a-z0-9._]{2,32}$`.
- Katalog Telegram: baris kedua `by @owner`; footer embed Discord: `... • @owner`.
- Kosong = disembunyikan.

## 5. Buy alert + total
- Default template: `{{user}} Membeli {{quantity}} {{productName}} akun — {{total}}`
- `{{total}}` = Rupiah (`paymentAmount || subtotal`), contoh `yiestera Membeli 1 API Key CoralBricks 3$ akun — Rp 2.000`
- Template default lama otomatis dimigrasi; template custom tidak disentuh.

## 6. Versi aplikasi
- `src/lib/brand.ts`: `APP_VERSION = "1.1.0"` → tampil di sidebar `Admin Panel · v1.1.0`.
- Bump manual tiap rilis.

## 7. Keamanan (audit + hardening)
- Security headers + CSP admin, `Cache-Control: no-store`, HSTS di Caddy.
- `middleware.ts` fast-reject untuk `/admin*` & `/api/admin*` tanpa cookie sesi.
- Login timing-safe (dummy bcrypt compare) + pesan gagal generik (anti enumerasi).
- Same-origin API divalidasi `Origin`+`Referer`.
- Laporan lengkap: `docs/security-audit-v1.1.0.md`.

## Verifikasi rilis
`npx tsc --noEmit` bersih · `npm run build` sukses · `npx tsx scripts/selfcheck.mts` ok · deploy GHCR + `docker compose pull`.
