# Update v1.1.2 — `/setlog` + kunci channel log Telegram

Status: **implemented** (`1.1.2`)

## Masalah
`telegramAdminChannelId` sebelumnya hanya bisa diisi manual atau terisi otomatis saat bot
ditambahkan ke channel. Saat bot ditambahkan ke channel lain, tombol "Pakai channel ini
sebagai log" tetap muncul dan bisa menimpa channel log tanpa sengaja. Tidak ada cara cepat
memastikan ID channel yang benar dari dalam Telegram sendiri.

## Solusi
Command **`/setlog`** dikirim di channel log:

1. Bot memverifikasi pengirim via `getChatMember` → harus `creator`/`administrator`
   (fail-closed: status lain ditolak).
2. `telegramAdminChannelId` = `chat.id` channel itu, `telegramAdminChannelLocked = true`.
3. Bot membalas konfirmasi, lalu menghapus pesan `/setlog` (kalau punya izin).
4. Saat terkunci:
   - field chat ID di panel jadi read-only;
   - tombol "Pakai channel ini sebagai log" dan auto-detect saat bot ditambahkan ke
     channel lain tidak menimpa apa pun (bot hanya menginformasikan channel log aktif);
   - perubahan hanya lewat tombol **Unlock Channel Log** di panel (aksi eksplisit),
     lalu isi manual atau kirim `/setlog` lagi.

Tombol lama tetap ada dan kini juga mengunci (`setlog:<id>` callback).

## File
- `src/lib/settings.ts` — setting baru `telegramAdminChannelLocked` (default `false`).
- `src/lib/telegram.ts` — `channel_post` di `allowed_updates`, tipe update, helper
  `isChannelAdminStatus`, `deleteTelegramMessage`.
- `src/bot/telegram/handlers.ts` — `handleChannelPost` (`/setlog`), guard lock di
  auto-detect & callback.
- `src/app/admin/settings/telegram/page.tsx` — status "terkunci", input read-only, tombol Unlock.
- `src/app/admin/actions.ts` — save mengabaikan field saat terkunci; `unlockTelegramLogChannelAction`.
- `scripts/selfcheck.mts` — assert `isChannelAdminStatus`.

## Cara pakai
1. Tambahkan bot sebagai **admin** channel log (izin kirim + hapus pesan).
2. Kirim `/setlog` di channel.
3. Panel → Settings → Telegram: ID tampil "terkunci".
4. Untuk pindah channel: Unlock → kirim `/setlog` di channel baru.

## Catatan
- Bot API tidak punya endpoint "daftar channel bot" — karena itu command di channel
  (bukan dropdown) yang jadi sumber ID paling andal.
- `channel_post` hanya dikirim Telegram untuk bot yang admin di channel itu.
