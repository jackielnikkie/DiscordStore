import { AppShell } from "../../../../components/app-shell";
import { Notice } from "../../../../components/notice";
import { SavedState, StatusGrid, StatusTile, WarningList } from "../../../../components/settings-status";
import { ToggleField } from "../../../../components/toggle-field";
import { maskSecret, detectPaymenkuMode, getAllSettings, getWebhookUrl } from "../../../../lib/settings";
import { formatRupiah } from "../../../../lib/money";
import { listPaymenkuChannels, type PaymenkuChannel } from "../../../../lib/paymenku";
import { savePaymentSettingsAction, testPaymenkuAction } from "../../actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function PaymentSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, settings] = await Promise.all([searchParams, getAllSettings()]);
  const payment = settings.payment;
  const mode = detectPaymenkuMode(payment.paymenkuApiKey);
  const webhookUrl = getWebhookUrl();

  const channels: PaymenkuChannel[] | null = payment.paymenkuApiKey
    ? await listPaymenkuChannels().catch(() => null)
    : null;

  const selected = channels?.find((channel) => channel.code === payment.paymenkuChannelCode);

  const warnings: string[] = [];

  if (!payment.paymenkuApiKey) {
    warnings.push("API key Paymenku belum diisi — checkout tidak akan bisa membuat transaksi.");
  }
  if (!payment.paymenkuWebhookSecret) {
    warnings.push("Webhook secret belum diisi — semua webhook akan ditolak (401).");
  }
  if (channels && !selected) {
    warnings.push(
      `Channel "${payment.paymenkuChannelCode}" tidak ada di daftar kanal aktif merchant — pilih ulang dari dropdown.`,
    );
  }
  if (!channels && payment.paymenkuApiKey) {
    warnings.push("Gagal mengambil daftar kanal dari Paymenku — cek API key / koneksi server.");
  }
  if (payment.returnUrl && !payment.returnUrl.startsWith("https://")) {
    warnings.push("Return URL sebaiknya HTTPS agar redirect setelah bayar tidak diblokir.");
  }
  if (payment.allowSandboxDelivery) {
    warnings.push(
      "Delivery untuk transaksi SANDBOX sedang diaktifkan — produk akan terkirim walau tidak ada dana nyata. Matikan sebelum produksi.",
    );
  }

  return (
    <AppShell
      title="Paymenku Settings"
      description="API key, channel pembayaran aktif, webhook, dan return URL."
    >
      <Notice
        message={typeof params.message === "string" ? params.message : undefined}
        error={typeof params.error === "string" ? params.error : undefined}
      />

      <Card>
        <CardHeader>
          <CardTitle>Ringkasan Status</CardTitle>
          <CardDescription>Kesiapan integrasi pembayaran.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <StatusGrid>
            <StatusTile
              label="Mode"
              value={mode === "unknown" ? "belum terdeteksi" : mode}
              tone={mode === "production" ? "success" : mode === "sandbox" ? "warning" : "neutral"}
              hint={payment.paymenkuApiKey ? maskSecret(payment.paymenkuApiKey) : "API key kosong"}
            />
            <StatusTile
              label="Channel"
              value={selected?.name || payment.paymenkuChannelCode || "-"}
              tone={selected ? "success" : "warning"}
              hint={
                selected
                  ? `${selected.type} • fee ${selected.fee_mode || "-"}`
                  : "belum cocok dengan kanal aktif"
              }
            />
            <StatusTile
              label="Kanal Aktif"
              value={channels ? `${channels.length} kanal` : "tidak diketahui"}
              tone={channels && channels.length > 0 ? "success" : "warning"}
              hint="diambil dari GET /payment-channels"
            />
            <StatusTile
              label="Webhook Secret"
              value={payment.paymenkuWebhookSecret ? "Tersimpan" : "Belum diisi"}
              tone={payment.paymenkuWebhookSecret ? "success" : "warning"}
              hint={payment.paymenkuWebhookSecret ? maskSecret(payment.paymenkuWebhookSecret) : undefined}
            />
          </StatusGrid>
          <WarningList items={warnings} />
        </CardContent>
      </Card>

      <form
        id="payment-settings-form"
        action={savePaymentSettingsAction}
        className="space-y-6"
      >
        <input type="hidden" name="redirectTo" value="/admin/settings/payment" />

        <Card>
          <CardHeader>
            <CardTitle>Paymenku Configuration</CardTitle>
            <CardDescription>
              Kanal diambil dari API, bukan ditanam di kode — fee dan batas nominal bisa
              berbeda per merchant.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="paymenkuApiKey">Paymenku API Key</Label>
              <Input id="paymenkuApiKey" name="paymenkuApiKey" defaultValue="" placeholder={payment.paymenkuApiKey ? "••••••••••••..." : "sk_live_ / sk_test_"} />
              <SavedState
                saved={Boolean(payment.paymenkuApiKey)}
                masked={payment.paymenkuApiKey ? maskSecret(payment.paymenkuApiKey) : undefined}
              />
              <p className="text-xs text-muted-foreground">
                Kosongkan untuk mempertahankan key yang tersimpan.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="paymenkuWebhookSecret">Webhook Secret</Label>
              <Input id="paymenkuWebhookSecret" name="paymenkuWebhookSecret" defaultValue="" placeholder={payment.paymenkuWebhookSecret ? "••••••••••••..." : ""} />
              <SavedState
                saved={Boolean(payment.paymenkuWebhookSecret)}
                masked={payment.paymenkuWebhookSecret ? maskSecret(payment.paymenkuWebhookSecret) : undefined}
              />
              <p className="text-xs text-muted-foreground">
                Dipakai untuk HMAC-SHA256 <code>timestamp + "." + raw body</code>.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="paymenkuChannelCode">Channel Pembayaran</Label>
              {channels && channels.length > 0 ? (
                <select
                  id="paymenkuChannelCode"
                  name="paymenkuChannelCode"
                  defaultValue={payment.paymenkuChannelCode}
                  className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-[box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {channels.map((channel) => (
                    <option key={channel.code} value={channel.code}>
                      {channel.name} · {channel.code} · {channel.type} · fee {channel.fee_mode || "-"}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="paymenkuChannelCode"
                  name="paymenkuChannelCode"
                  defaultValue={payment.paymenkuChannelCode}
                  placeholder="qris"
                />
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="returnUrl">Return URL</Label>
              <Input id="returnUrl" name="returnUrl" defaultValue={payment.returnUrl} />
            </div>

            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="webhookUrl">Webhook URL (set di dashboard Paymenku)</Label>
              <Input id="webhookUrl" name="webhookUrl" defaultValue={webhookUrl} readOnly />
            </div>

            <div className="grid gap-2 md:col-span-2">
              <ToggleField
                label="Izinkan delivery untuk transaksi sandbox (khusus testing)"
                name="allowSandboxDelivery"
                defaultChecked={payment.allowSandboxDelivery}
              />
              <p className="text-xs text-muted-foreground">
                Default mati: transaksi sandbox ditandai PAID tanpa mengirim produk.
                Nyalakan hanya saat uji end-to-end sandbox, lalu matikan lagi sebelum
                produksi.
              </p>
            </div>

            {selected ? (
              <div className="grid gap-1 rounded-lg border bg-background/40 p-3 text-xs text-muted-foreground md:col-span-2">
                <p className="font-medium text-foreground">Detail kanal terpilih</p>
                <p>
                  Tipe: {selected.type} • flow: {selected.flow_type || "-"} • fee mode: {selected.fee_mode || "-"}
                </p>
                <p>
                  Fee: {formatRupiah(Number(selected.fee_flat ?? 0))} + {selected.fee_percent ?? 0}% •
                  batas: {formatRupiah(Number(selected.min_amount ?? 0))} – {formatRupiah(Number(selected.max_amount ?? 0))}
                </p>
                <p className="flex items-center gap-2">
                  Status: <Badge variant="outline">{mode}</Badge>
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </form>

      <div className="flex items-center gap-3">
        <Button type="submit" form="payment-settings-form">Save Settings</Button>
        <form action={testPaymenkuAction}>
          <input type="hidden" name="redirectTo" value="/admin/settings/payment" />
          <Button variant="outline" type="submit">Test Connection</Button>
        </form>
      </div>
    </AppShell>
  );
}
