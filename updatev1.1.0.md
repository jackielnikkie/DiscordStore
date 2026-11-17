# Update v1.1.0 — Stock table: multi-select + masking

Status: plan disetujui (siap diimplementasi)

## Keputusan final
1. **Masking server-side** — HTML tidak memuat isi asli; reveal lewat API ber-auth.
2. **Hapus massal hanya untuk `AVAILABLE`**; `RESERVED`/`SOLD` dilewati dan dilaporkan.
   Hapus per baris tetap boleh semua status (aksi eksplisit satu baris), pakai konfirmasi.
3. **Filter status wajib** (Available / Reserved / Sold / Semua) + pagination 50.
   Pencarian teks **tidak** masuk v1.1.0.

## 1. Multi-select + bulk delete
- Checkbox per baris, checkbox header = select-all baris di halaman (indeterminate saat sebagian).
- Toolbar saat ada pilihan: `{n} dipilih` · **Hapus terpilih** · **Batalkan**.
- Tombol **Pilih semua hasil filter** → submit `all=1` + filter aktif; server menghapus semua `AVAILABLE` yang cocok filter.
- Hasil: notice `x dihapus, y dilewati (reserved/sold)`.
- Konfirmasi menyebut jumlah + peringatan "hanya stok AVAILABLE yang dihapus".
- Pagination: `page` (default 1), `perPage` 50; filter `status` dipertahankan di link pagination.

## 2. Masking server-side
- `src/lib/stock-mask.ts`: `maskStockContent(content)` → `ab••••yz` (sisakan 2 karakter awal/akhir, tengah `•`) dan `parseStockIds(raw)`.
- Server render: tabel hanya berisi hasil masking.
- Reveal: `POST /api/admin/stock/reveal` body `{ ids: string[] }` (maks 100 id) → `{ items: { id, content }[] }`, wajib sesi admin + same-origin.
- UI: tombol mata per baris (batch/individual), **Tampilkan semua** (batch id yang sedang tampil), **Sembunyikan semua**, tombol copy per baris (aktif setelah terlihat).
- Baris yang belum di-reveal tetap masked setelah reload (tidak ada cache isi di server).

## 3. File yang disentuh
| File | Perubahan |
|---|---|
| `src/components/stock-table.tsx` (baru) | checkbox, toolbar, masking state, copy, link filter/pagination |
| `src/app/admin/products/[id]/stock/page.tsx` | query filter+page, render `StockTable`, tampilkan notice |
| `src/app/admin/actions.ts` | `deleteStockBulkAction` (hanya AVAILABLE + mode `all`), `deleteStockAction` tetap |
| `src/app/api/admin/stock/reveal/route.ts` (baru) | batch reveal, auth admin |
| `src/lib/stock-mask.ts` (baru) | masking + parser id |
| `scripts/selfcheck.mts` | assert masking, parse id, whitelist filter status |

Tanpa perubahan schema DB.

## Kriteria selesai
- Select-all header bekerja, indeterminate benar, pilihan hilang setelah aksi.
- Bulk delete hanya menghapus AVAILABLE; jumlah dihapus/dilewati akurat; filter tidak berubah setelah aksi.
- HTML tabel tidak mengandung isi asli (cek `curl` halaman = masked).
- Reveal/copy berfungsi, UI kembali masked saat disembunyikan.
- `tsc --noEmit`, `npm run build`, `npx tsx scripts/selfcheck.mts` hijau; deploy via Actions + `compose pull`.

## Catatan risiko
- Reveal endpoint = jalur baca isi stok; hanya untuk sesi admin, batasi jumlah id per request.
- `all=1` wajib memakai filter yang sama dengan tampilan; kalau tidak, baris tak terlihat bisa terhapus (mitigasi: hitung dulu + konfirmasi jumlah).
- SOLD tidak bisa dihapus massal untuk menjaga audit order; refund/cancel tetap jalur resmi.
