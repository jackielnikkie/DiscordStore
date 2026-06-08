export default function OrderSuccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card max-w-xl space-y-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/70">
          Payment Return
        </p>
        <h1 className="text-4xl font-semibold text-ink">Pembayaran sedang diproses</h1>
        <p className="text-sm leading-7 text-slate">
          Jika status sudah `paid`, bot akan mengirim produk otomatis lewat DM Discord.
          Jika belum menerima DM, tunggu beberapa saat lalu cek lagi dari dashboard admin.
        </p>
      </div>
    </div>
  );
}
