# Update v1.1.3 — QR hilang setelah paid + QR string tidak dikirim

Status: **implemented** (`1.1.3`)

## 1. Pesan invoice dihapus saat pembayaran sukses
Sebelumnya pesan invoice (foto QR Telegram / embed QR Discord) tetap ada setelah order
`PAID`, jadi QR bisa dipakai orang lain atau bikin bingung.

Sekarang:
- `Order.invoiceMessageId` (kolom baru, `ensureColumn`) menyimpan id pesan invoice —
  Telegram `message_id`, Discord message id. Diisi saat invoice dikirim.
- Setelah delivery sukses (`deliverOrder` → `removeInvoiceMessage` di `src/lib/notify.ts`),
  pesan invoice **dihapus**: Telegram `deleteMessage`, Discord `dm.messages.delete()`.
- Best-effort: pesan lebih tua dari 48 jam, izin kurang, atau sudah dihapus → diabaikan
  diam-diam (delivery tetap sukses).
- Sandbox (`sandbox_blocked`) tidak menghapus apa pun karena delivery tidak jalan.
- Auto-cancel/expired **tidak** menghapus invoice (hanya saat paid).

## 2. QR string tidak dikirim ke buyer
`buildInstructionLines` tidak lagi menambahkan baris `QR string: …` secara default
(opsi baru `includeQrString`, default `false`). Berlaku untuk Telegram (caption invoice)
dan Discord (field instruksi). Nilai mentah tetap disimpan di `Order.paymenkuQrString`
untuk riwayat/panel admin.

## File
- `src/lib/db.ts` — kolom `Order.invoiceMessageId` (schema, `ensureColumn`, `TABLE_COLUMNS`,
  create/update).
- `src/lib/db-types.ts` — field `invoiceMessageId`.
- `src/lib/notify.ts` — `removeInvoiceMessage(order)` + `deleteTelegramMessage`.
- `src/services/orderService.ts` — panggil hapus invoice setelah delivery sukses.
- `src/bot/telegram/handlers.ts` — simpan `message_id` invoice.
- `src/bot/handlers/interactionCreate.ts` — simpan id pesan DM invoice Discord.
- `src/lib/paymenku-instruction.ts` — `includeQrString` (default sembunyi).
- `scripts/selfcheck.mts` — assert QR string tersembunyi default.

## Catatan
- Bot Telegram perlu izin **delete messages** di chat buyer? Tidak — menghapus pesan di
  DM/private chat yang dikirim bot sendiri selalu boleh.
- Discord: bot menghapus pesan DM-nya sendiri, tidak butuh permission khusus.
