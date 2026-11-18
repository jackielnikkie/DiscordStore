# HANDOFF — LapakLoka-MultiBotStore

Dokumen ini untuk session/engineer berikutnya. Tanpa secret: token, password, dan key **tidak** ditulis di sini (semua ada di `.env` VPS + panel admin).

- Versi aplikasi: **1.1.2** → `src/lib/brand.ts` (`APP_VERSION`, tampil di sidebar `Admin Panel - v1.1.2`)
- Repo: `https://github.com/jackielnikkie/DiscordStore.git` (branch `main`)
- Produksi: `https://55go.biz.id`

---

## 1. Apa ini

Toko akun/API key digital dengan dua storefront:

- **Discord** — embed katalog + tombol Buy, invoice via DM, delivery via DM.
- **Telegram** — katalog di chat pribadi bot (`/start`), invoice + QRIS, delivery di chat.
- **Admin panel** (`/admin`) — produk, stok, order, payment, settings Discord/Telegram/Paymenku.
- **Pembayaran** — Paymenku QRIS (webhook = sumber status resmi; polling hanya rekonsiliasi).

Alur order: pilih produk → pilih qty → order `PENDING` + stok di-reserve → invoice QRIS → bayar → webhook `paid` → stok `SOLD` + delivery (blok copy + file `.txt` + catatan produk) → buy alert ke channel admin.

---

## 2. Stack & lokal

- Next.js 15 (App Router) + React 19 + Tailwind + komponen shadcn-style di `src/components/ui`.
- **SQLite via `node:sqlite`** (bukan Prisma). Shim "prisma-like" di `src/lib/db.ts`. **Butuh Node ≥ 22.5**.
- Bot: `discord.js`; Telegram pakai Bot API langsung via `fetch` (tanpa library).
- Script:

```bash
npm install
npm run dev        # next dev + worker (Discord + Telegram + poller)
npm run dev:web    # web saja (auto-cancel & polling TIDAK jalan)
npm run dev:bot    # worker saja
npm run build      # build produksi
npx tsx scripts/selfcheck.mts   # assert helper murni + cek kolom DB
npx tsc --noEmit
```

`.env` wajib: `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (bcrypt), `NEXT_PUBLIC_APP_URL`, `DATABASE_URL`, opsional `TELEGRAM_BOT_TOKEN`, `DISCORD_*`, `PAYMENKU_*`, `DOMAIN`, `ACME_EMAIL`.

Hash password: `node -e "console.log(require('bcryptjs').hashSync('pw',12))"`.

---

## 3. Infrastruktur produksi

| Item | Nilai |
|---|---|
| VPS | `213.163.202.252` (UpCloud), Ubuntu 26.04, x86_64, ±3.8 GB RAM |
| SSH | key `upcloud2.ppk` (PuTTY/OpenSSH ed25519). **Password root dimatikan** (`PermitRootLogin prohibit-password`) — hanya key |
| Repo di VPS | `/opt/discordstore` |
| Container | `discordstore-app-1` (web + worker dalam satu container), `discordstore-caddy-1` |
| Domain/TLS | `55go.biz.id` via Caddy (Let's Encrypt otomatis) |
| Env | `/opt/discordstore/.env` (mode 600) |
| DB | SQLite di named volume `app_data` → `/app/data/dev.db` |
| Backup | `/etc/cron.d/discordstore-backup` 03:00 harian → `/opt/discordstore/backups/`, retensi 14 hari |
| Image | `ghcr.io/jackielnikkie/discordstore:latest` (public) |
| Actions | `.github/workflows/docker.yml` — push `main` → build & push image (~2 menit) |

Satu container sengaja: SQLite dipakai web + worker, jadi satu process tree (hindari dua host berbagi file WAL).

### Ritual rilis

```bash
# lokal
npx tsc --noEmit && npx tsx scripts/selfcheck.mts && npm run build
git add -A && git commit -m "..." && git push origin main

# tunggu GitHub Actions sukses dulu (kalau pull sebelum selesai, image lama yang ke-deploy)

# VPS
cd /opt/discordstore
git pull --ff-only
docker compose pull
docker compose up -d
docker compose ps
```

Cek cepat: `curl -s -o /dev/null -w '%{http_code}' https://55go.biz.id/admin/login` → `200`.

---

## 4. Peta arsitektur

```
src/
  app/
    admin/
      actions.ts            # server actions lama (login, produk, settings, order lama)
      order-actions.ts      # 4 tombol detail order (resend/check/mark-paid/cancel)
      stock-actions.ts      # bulk delete stok
      orders/[id]/page.tsx  # detail order + tombol + catatan produk
      products/…            # list, edit, new, stock
      settings/{bot,telegram,payment,account}/page.tsx
    api/
      webhooks/paymenku/route.ts   # HMAC + fast-ack (after()) + mapping status
      admin/**                     # REST admin (guard requireAdminApi)
      order/success/route.ts
  bot/
    index.ts                # orchestrator: Discord loop + Telegram worker + order poller
    handlers/interactionCreate.ts  # tombol Buy/qty/checkpay (Discord)
    services/{buyAlert,embedSync}.ts
    telegram/{index,handlers,catalog}.ts
  components/
    stock-table.tsx         # client: select-all, masking reveal, bulk delete
    product-form.tsx        # client: tier harga, slug auto, catatan pengiriman
    settings-status.tsx     # StatusGrid/Tile, SavedState, WarningList
  lib/
    db.ts                   # SQLite shim + schema + ensureColumn (migrasi manual)
    settings.ts             # SEMUA konfigurasi (bot/telegram/payment/text) + defaults
    validators.ts           # zod schema (form/API)
    pricing.ts              # tier harga grosir (per item, berlaku ≥ qty)
    paymenku.ts             # API client (envelope, channels, create/check/cancel/refund)
    paymenku-instruction.ts # instruksi per kanal (QRIS/VA/e-wallet/retail)
    delivery-format.ts      # blok copy, escaping, catatan produk, file .txt
    notify.ts               # dispatcher kirim ke buyer (Discord DM / Telegram chat)
    telegram.ts             # Bot API wrapper (long-poll, keyboard, document)
    auth.ts, crypto.ts, admin-api.ts, status.ts, stock-mask.ts, brand.ts, slug.ts
  services/
    orderService.ts         # state machine order + delivery + expiry
    paymentService.ts       # rekonsiliasi status
    productService.ts, stockService.ts
  middleware.ts             # fast-reject admin tanpa cookie
```

### Aturan penting (jangan dilanggar)

- **`src/lib/settings.ts` adalah sumber semua setting**; jangan bikin file config baru.
- **`src/lib/notify.ts` satu-satunya jalur kirim ke buyer**; tambah platform = tambah cabang di situ.
- **Webhook = sumber status resmi.** Polling hanya rekonsiliasi (3 menit, 10 order).
- **Sandbox tidak boleh mengirim produk** kecuali toggle `allowSandboxDelivery` dinyalakan manual.
- **Delivery pakai `deliverOrder`** yang mengembalikan `{delivered, reason, order}` (`delivered` | `already_delivered` | `sandbox_blocked`). Jangan menganggap sukses berdasarkan tidak adanya exception.
- **Stok**: reserve → `RESERVED`, paid → `SOLD`, cancel/expire → balik `AVAILABLE`. `soldCount` hanya naik saat paid, turun saat refund (fitur refund dibuang, jadi tidak dipakai).
- **Semua isi stok disensor di HTML** (`maskStockContent`); reveal lewat `POST /api/admin/stock/reveal`.

---

## 5. Status fitur (v1.1.0, semua live)

- Produk: CRUD, tier harga grosir dinamis (≥ qty, per item), slug otomatis, aktif/nonaktif cepat dari list & detail, catatan pengiriman per produk.
- Stok: tambah/import, filter status, pagination 50, select-all + hapus massal (**hanya AVAILABLE**), masking server-side + reveal/copy.
- Order: tombol status-aware, resend jujur, cek payment + self-heal delivery, cancel PENDING (best-effort Paymenku cancel).
- Auto-cancel **10 menit** → status **`CANCELLED`** + stok `AVAILABLE` (bukan `EXPIRED` lagi).
- Delivery: blok `<code>` (tap-copy), lampiran `order-<ref>.txt`, catatan produk, escape HTML, batas 40 baris di pesan.
- Telegram: katalog di private chat, gate wajib join multi-channel, deep link `?start=buy_<id>`, judul katalog sendiri, `by @owner`.
- Discord: embed katalog + buy alert (`{{total}}` Rupiah, `allowedMentions: {parse: []}`).
- Paymenku: channel dari API (`/payment-channels`, cache 10 menit), validasi min/max, envelope + `errors`, instruksi VA/e-wallet/retail, sandbox guard, webhook fast-ack.
- Keamanan: CSP + headers admin, HSTS (Caddy), `Cache-Control: no-store`, middleware fast-reject, login timing-safe + pesan generik, same-origin ketat, body-size precheck.

---

## 6. Yang BELUM selesai / perlu tindakan

### Konfigurasi (bukan kode)
1. **`telegramAdminChannelId`**: kirim `/setlog` di channel log yang benar (bot harus admin). Command ini memverifikasi kamu admin channel, menyimpan ID, dan **menguncinya** supaya tidak ketimpa. Lihat `updatev1.1.2.md`; tombol lama "Pakai channel ini sebagai log" tetap ada (juga mengunci).
2. **Discord belum aktif** (topbar `Discord Offline`) — token/guild/channel belum diisi.
3. Stok produk saat ini **0** (sudah di-reset untuk publish) — isi stok asli sebelum jualan.
4. `allowSandboxDelivery` sudah **false** (jangan dinyalakan saat live).
5. Paymenku masih bisa sandbox/live — pastikan key `sk_live_`, webhook secret live, dan callback URL terdaftar.
6. `ownerDiscord` kosong → baris `by @owner` tidak muncul.

### Backlog kode
- **v1.1.1 (selesai)**: checklist hardening audit v1.1.0 dijalankan — lihat `updatev1.1.1.md`.
  Yang **dibatalkan**: rate limit Caddy (`rate_limit` butuh module non-standar, Caddy gagal start)
  dan rekonsiliasi webhook berbasis log (tidak perlu; webhook sudah sinkron + backstop PENDING).
- Refund/cancel **via API Paymenku** tidak diekspos ke UI (keputusan owner: tidak perlu; QRIS tidak didukung refund API).
- Belum ada: export CSV order, chart omzet, low-stock alert, storefront web publik, halaman status order publik, voucher.
- `dmInvoiceText` dipakai Telegram (template ringkas); invoice Discord masih hardcoded di embed.

---

## 7. Jebakan teknis (yang sudah pernah menggigit)

| Jebakan | Solusi |
|---|---|
| `docker compose exec` menelan stdin skrip remote | tambahkan `< /dev/null` |
| `next build` di Docker tanpa `.env` | jangan throw di module scope untuk env wajib (lihat `crypto.ts` lazy secret) |
| Pull image sebelum Actions selesai | cek run Actions `completed + success` dulu |
| `bcrypt` hash di `.env` compose | `$` di-interpolasi compose → tulis `$$` |
| SQLite shim | tidak ada `in`, `skip`, `AND` kompleks; pakai loop/`updateMany`; transaksi = `$transaction(fn)` |
| Migrasi kolom | `ensureColumn()` di `src/lib/db.ts` (contoh: `Order.platform`, `Product.deliveryNote`) — **wajib** tambah juga ke `TABLE_COLUMNS` (whitelist identifier v1.1.1), kalau tidak query throw |
| Worker mati | order PENDING menggantung, auto-cancel tidak jalan |
| Semua sesi admin invalid setelah upgrade v1.1.1 | nama cookie jadi `__Host-discordstore_admin` di production — login ulang sekali, bukan bug |
| CSP admin | butuh `unsafe-inline` untuk hydration Next |

---

## 8. Verifikasi cepat (read-only)

```bash
# publik
curl -s -o /dev/null -w '%{http_code}\n' https://55go.biz.id/admin/login
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://55go.biz.id/admin   # 307 → login?error=session_expired
curl -sI https://55go.biz.id/admin/login | grep -iE 'content-security-policy|strict-transport|x-frame'

# data (di VPS)
cd /opt/discordstore
docker compose exec -T app sqlite3 data/dev.db \
  "select referenceId, status, ifnull(deliveryError,'-') from \"Order\" order by createdAt desc limit 5;" < /dev/null
docker compose exec -T app sqlite3 data/dev.db \
  "select key, substr(value,1,40) from Setting where key like 'telegram%' or key='allowSandboxDelivery';" < /dev/null

# log worker
docker compose logs --tail 80 app | grep -iE 'telegram|bot|paymenku'
```

Telegram heartbeat > 3 menit = worker tidak polling. Order PENDING tidak pernah hilang = worker mati / expiry tidak jalan.

---

## 9. Aturan kolaborasi

- Jangan commit `.env`, `dev.db`, `backups/`, token.
- Satu perubahan = satu commit bermakna; pesan commit bahasa Indonesia/Inggris bebas, konsisten.
- Sebelum klaim selesai: `npx tsc --noEmit`, `npx tsx scripts/selfcheck.mts`, `npm run build`, lalu deploy + verifikasi HTTP.
- Jangan hapus backup `backups/prepublish-*.db` (snapshot sebelum reset data).
- Owner mengambil keputusan bisnis: **tanpa refund**, **auto-cancel = CANCELLED**, **catatan per produk (bukan global)**, **Telegram katalog di private chat (bukan channel)**.
