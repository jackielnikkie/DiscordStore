# Deploy ke VPS (Docker + Caddy)

Satu container menjalankan web (`next start`) dan worker (Discord + Telegram + poller), SQLite di named volume `app_data`. Caddy menangani HTTPS otomatis.

## 1. Siapkan VPS

```bash
# Debian/Ubuntu
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
```

Buka port 80, 443 (TCP) dan 443 (UDP) di firewall. Pastikan DNS domain sudah mengarah ke IP VPS.

## 2. Ambil project

```bash
git clone https://github.com/jackielnikkie/DiscordStore.git /opt/discordstore
cd /opt/discordstore
cp .env.example .env
nano .env
```

Wajib diisi:

- `DOMAIN` + `ACME_EMAIL` (Caddy)
- `SESSION_SECRET` (acak panjang)
- `ADMIN_PASSWORD_HASH` — `node -e "console.log(require('bcryptjs').hashSync('pw',12))"` (jalankan lokal)
- `NEXT_PUBLIC_APP_URL=https://domain-kamu`
- `ALLOWED_DEV_ORIGINS=""`

Token Discord/Telegram dan key Paymenku boleh diisi dari panel admin setelah jalan.

> Penting: hash bcrypt mengandung karakter `$`. Docker Compose menginterpolasi `$` di `.env`, jadi tulis **`$$`** untuk setiap `$`:
> `ADMIN_PASSWORD_HASH="$$2b$$12$$abcdef..."`. Verifikasi dengan `docker compose exec app printenv ADMIN_PASSWORD_HASH`.

## 3. Akses image GHCR

Image dibangun GitHub Actions dan dipush ke `ghcr.io/jackielnikkie/discordstore`.

Opsi paling gampang: buka **Packages** di repo → `discordstore` → *Package settings* → ubah visibility ke **Public**. Setelah itu VPS tidak perlu login.

Kalau tetap private:

```bash
echo <PAT_dengan_read:packages> | docker login ghcr.io -u jackielnikkie --password-stdin
```

## 4. Jalankan

```bash
docker compose pull
docker compose up -d
docker compose logs -f app
```

Cek `https://domain-kamu/admin` — login pakai `ADMIN_USERNAME` + password yang di-hash tadi.

Lalu:

1. Panel → Bot Settings: token Discord, channel auto-order + buy alert, Sync Auto-Order Embed.
2. Panel → Telegram: token BotFather, aktifkan, Test Connection.
3. Panel → Payment: Paymenku API key + webhook secret.
4. Dashboard Paymenku → webhook `https://domain-kamu/api/webhooks/paymenku`.

## 5. Update

Push ke `main` → Actions build image baru (`latest` + tag sha). Di VPS:

```bash
cd /opt/discordstore
git pull
docker compose pull
docker compose up -d
```

Rollback: pakai tag sha, mis. `docker compose run --rm app` tidak perlu — ubah image di compose ke `ghcr.io/jackielnikkie/discordstore:sha-xxxxxxx` lalu `up -d`.

## 6. Backup

Data ada di named volume `app_data` (bukan folder host, supaya permission SQLite tidak ribet).

```bash
docker compose exec -T app sqlite3 data/dev.db ".backup data/backup-$(date +%F).db"
docker compose cp app:/app/data/backup-$(date +%F).db ./backups/
```

Taruh di `crontab -e`:

```cron
0 3 * * * cd /opt/discordstore && docker compose exec -T app sqlite3 data/dev.db ".backup data/backup-$(date +\%F).db" && docker compose cp app:/app/data/backup-$(date +\%F).db ./backups/
```

Salin folder `./backups` ke storage lain secara berkala.

## 7. Tanpa registry (build di VPS)

Kalau tidak mau pakai Actions: di `docker-compose.yml` ganti baris `image:` jadi `build: .`, lalu:

```bash
git pull && docker compose up -d --build
```

Build butuh ±1.5 GB RAM sementara; VPS 4 GB aman.

## Troubleshooting

- **Caddy gagal dapat sertifikat** → DNS belum propagasi / port 80 tertutup.
- **`node:sqlite` error** → pastikan base image `node:22` (jangan diganti ke 20).
- **Bot Telegram diam** → `docker compose logs app`, cek `telegramReadyState` di panel; token salah atau bot belum di-`/start`.
- **Order PENDING tidak expire** → worker mati; container harus jalan (web + worker satu proses tree).
- **Data hilang setelah `up -d`** → pastikan volume `app_data` tidak dihapus (`docker compose down -v` menghapusnya).
