# LapakLoka-MultiBotStore

Toko akun digital dengan dua storefront: **Discord** dan **Telegram**. Pembayaran QRIS otomatis via Paymenku, produk dikirim lewat chat/DM setelah pembayaran terverifikasi.

## Stack

- Next.js 15 (App Router) + React 19 + Tailwind
- SQLite lewat `node:sqlite` (butuh **Node ≥ 22.5**), schema dibuat otomatis saat pertama jalan
- `discord.js` untuk bot Discord
- Telegram Bot API via `fetch` (tanpa dependency tambahan)
- Paymenku untuk QRIS (webhook + polling status)

## Setup

```bash
npm install
cp .env.example .env
```

Isi `.env`:

| Variabel | Keterangan |
| --- | --- |
| `SESSION_SECRET` | string acak panjang |
| `ADMIN_USERNAME` | default `admin` |
| `ADMIN_PASSWORD_HASH` | hash bcrypt password admin |
| `NEXT_PUBLIC_APP_URL` | URL publik app, dipakai untuk `return_url` dan webhook |
| `DATABASE_URL` | default `file:./dev.db` |
| `PAYMENKU_API_KEY` | opsional, bisa diisi dari panel |
| `PAYMENKU_WEBHOOK_SECRET` | opsional, bisa diisi dari panel |
| `TELEGRAM_BOT_TOKEN` | opsional, bisa diisi dari panel |
| `ALLOWED_DEV_ORIGINS` | origin tambahan untuk `next dev`, pisah koma |

Buat hash password:

```bash
node -e "console.log(require('bcryptjs').hashSync('passwordkamu', 12))"
```

Jalankan:

```bash
npm run dev     # web + worker Discord + worker Telegram
npm run dev:web # web saja
npm run dev:bot # worker saja (Discord + Telegram + polling order)
```

Panel admin: `http://localhost:3000/admin`.

## Alur order

1. Buyer klik produk (Discord embed / katalog Telegram) → pilih qty.
2. Order dibuat `PENDING`, stok di-reserve, invoice QRIS dikirim ke chat buyer.
3. Pembayaran masuk via webhook `POST /api/webhooks/paymenku` (signature HMAC + timestamp 5 menit) atau polling tiap 60 detik.
4. Order `PAID` → stok jadi `SOLD` → data produk dikirim ke chat buyer → buy alert ke channel admin.
5. Order lewat masa berlaku → `EXPIRED`, stok dilepas. Pembayaran telat tetap diterima; kalau stok habis, order `PAID` dengan `deliveryError` untuk ditangani admin.

## Setup Discord

Isi token/client/guild di `/admin/settings/bot`, lalu:

- **Auto-Order Channel ID** — channel tempat embed katalog + tombol Buy.
- **Buy Alert Channel ID** — notifikasi pembelian.
- Klik **Test Connection** dan **Sync Auto-Order Embed**.

Bot butuh intent `Guilds`, `GuildMessages`, `DirectMessages`; buyer harus bisa menerima DM dari bot.

## Setup Telegram

1. Buat bot lewat [@BotFather](https://t.me/BotFather), salin token.
2. Isi token di `/admin/settings/telegram`, aktifkan **Enable bot Telegram**.
3. Klik **Test Connection**.

Katalog **tidak dikirim ke channel/group**. Buyer membuka chat pribadi bot lalu `/start` (atau `/products`) dan katalog + tombol produk dikirim langsung di chat itu. Tombol produk → pilih qty → invoice QRIS → delivery di chat yang sama.

Field **Chat ID Notifikasi Admin** hanya untuk buy alert dan pesan tes (boleh ID chat pribadi admin atau channel, format `-100...` untuk channel). Bot harus sudah pernah di-`/start` oleh admin agar bisa mengirim pesan ke chat pribadi.

Perintah buyer: `/start`, `/products`, `/history`. Deep link `t.me/<bot>?start=buy_<productId>` juga tetap didukung.

## Webhook Paymenku

URL: `https://domain-kamu/api/webhooks/paymenku`

Header yang diverifikasi: `X-Paymenku-Signature` (HMAC-SHA256 body+timestamp dengan webhook secret) dan `X-Paymenku-Timestamp`.

## Deploy (Docker)

`Dockerfile` + `docker-compose.yml` + `Caddyfile`. Satu container = web + worker, SQLite di named volume `app_data`, HTTPS otomatis via Caddy.

```bash
cp .env.example .env   # isi DOMAIN, ACME_EMAIL, SESSION_SECRET, ADMIN_PASSWORD_HASH
docker compose pull && docker compose up -d
```

Image dibangun otomatis oleh GitHub Actions (`.github/workflows/docker.yml`) saat push ke `main` → `ghcr.io/jackielnikkie/discordstore:latest`. Panduan lengkap: [docs/deploy.md](docs/deploy.md).

## Cek cepat

```bash
npx tsx scripts/selfcheck.mts   # helper Telegram + migrasi kolom platform
npx tsc --noEmit
npm run build
```

## Catatan

- Belum ada sistem migrasi; penambahan kolom dilakukan manual di `src/lib/db.ts` (`ensureColumn`).
- `Order.discordUserId` / `discordUsername` dipakai sebagai `customerId` / `customerName` generik untuk semua platform; `Order.platform` menandai asalnya.
- Login admin dibatasi 5 percobaan/IP dan 8/username per 10 menit (in-memory, reset saat restart).
