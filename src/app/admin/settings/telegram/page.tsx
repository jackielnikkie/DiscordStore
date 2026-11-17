import { AppShell } from "../../../../components/app-shell";
import { Notice } from "../../../../components/notice";
import { ToggleField } from "../../../../components/toggle-field";
import {
  SavedState,
  StatusGrid,
  StatusTile,
  WarningList,
} from "../../../../components/settings-status";
import { getAllSettings, maskSecret } from "../../../../lib/settings";
import { formatRelativeTime, isFresh } from "../../../../lib/status";
import {
  saveTelegramSettingsAction,
  testTelegramAction,
} from "../../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export default async function TelegramSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, settings] = await Promise.all([searchParams, getAllSettings()]);
  const telegram = settings.telegram;

  const hasToken = Boolean(telegram.telegramBotToken);
  const isOnline =
    telegram.telegramReadyState.startsWith("online") &&
    isFresh(telegram.telegramLastHeartbeatAt, 180_000);
  const heartbeat = formatRelativeTime(telegram.telegramLastHeartbeatAt);
  const forceJoinActive = telegram.telegramForceJoinEnabled;
  const forceJoinChannel = telegram.telegramForceJoinChannel;
  const forceJoinChannels = forceJoinChannel
    .split(/[\s,]+/)
    .map((channel) => channel.trim())
    .filter(Boolean);

  const warnings: string[] = [];

  if (telegram.telegramEnabled && !hasToken) {
    warnings.push("Bot Telegram aktif tapi token belum diisi.");
  }
  if (forceJoinActive && forceJoinChannels.length === 0) {
    warnings.push(
      "Gate join aktif tapi channel wajib join belum diisi — katalog akan terbuka untuk semua orang.",
    );
  }
  if (forceJoinActive && forceJoinChannels.length > 0 && !hasToken) {
    warnings.push("Gate join butuh token bot untuk cek membership.");
  }
  if (!telegram.telegramAdminChannelId) {
    warnings.push("Channel log store belum diatur — buy alert tidak akan terkirim.");
  }

  return (
    <AppShell
      title="Telegram Settings"
      description="Storefront Telegram: katalog, invoice QRIS, dan delivery otomatis lewat chat bot."
    >
      <Notice
        message={typeof params.message === "string" ? params.message : undefined}
        error={typeof params.error === "string" ? params.error : undefined}
      />

      <Card>
        <CardHeader>
          <CardTitle>Ringkasan Status</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <StatusGrid>
            <StatusTile
              label="Bot Telegram"
              value={
                telegram.telegramBotUsername
                  ? `@${telegram.telegramBotUsername}`
                  : "belum terhubung"
              }
              tone={
                isOnline ? "success" : telegram.telegramEnabled && !hasToken ? "warning" : "neutral"
              }
              hint={`heartbeat ${heartbeat}`}
            />
            <StatusTile
              label="Token"
              value={hasToken ? "Tersimpan" : "Belum diisi"}
              tone={hasToken ? "success" : "warning"}
              hint={hasToken ? maskSecret(telegram.telegramBotToken) : undefined}
            />
            <StatusTile
              label="Channel Log"
              value={telegram.telegramAdminChannelId || "belum diatur"}
              tone={telegram.telegramAdminChannelId ? "success" : "warning"}
              hint="buy alert masuk ke chat ini"
            />
            <StatusTile
              label="Gate Join"
              value={
                forceJoinActive
                  ? `Aktif: ${forceJoinChannels.length} channel`
                  : "Nonaktif"
              }
              tone={
                forceJoinActive
                  ? forceJoinChannels.length > 0
                    ? "success"
                    : "warning"
                  : "neutral"
              }
              hint={
                forceJoinActive
                  ? forceJoinChannels.join(", ") || "channel belum diisi"
                  : "katalog terbuka untuk semua"
              }
            />
          </StatusGrid>
          <WarningList items={warnings} />
        </CardContent>
      </Card>

      <form
        id="telegram-settings-form"
        action={saveTelegramSettingsAction}
        className="space-y-6"
      >
        <input type="hidden" name="redirectTo" value="/admin/settings/telegram" />

        <Card>
          <CardHeader>
            <CardTitle>Bot Configuration</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Telegram Bot Token"
                name="telegramBotToken"
                defaultValue=""
                placeholder={
                  telegram.telegramBotToken
                    ? maskSecret(telegram.telegramBotToken)
                    : "123456:ABC-DEF..."
                }
                hint={
                  <>
                    <SavedState
                      saved={hasToken}
                      masked={hasToken ? maskSecret(telegram.telegramBotToken) : undefined}
                    />
                    <span>Kosongkan field untuk tidak mengubah token yang tersimpan.</span>
                  </>
                }
              />
              <Field
                label="Chat ID Notifikasi Admin (opsional)"
                name="telegramAdminChannelId"
                defaultValue={telegram.telegramAdminChannelId}
                placeholder="123456789 atau -1001234567890"
              />
            </div>
            <div className="flex flex-wrap gap-6">
              <ToggleField
                label="Enable bot Telegram"
                name="telegramEnabled"
                defaultChecked={telegram.telegramEnabled}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Katalog dikirim bot langsung di chat pribadi buyer (/start). Chat ID di atas
              dipakai untuk log store (buy alert &amp; tes pesan).
            </p>
            <p className="text-xs text-muted-foreground">
              Status: {telegram.telegramReadyState}
              {telegram.telegramBotUsername
                ? ` • @${telegram.telegramBotUsername}`
                : ""}
              {` • heartbeat ${heartbeat}`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Katalog &amp; Gate Join</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4">
              <Field
                label="Judul Katalog Telegram"
                name="telegramCatalogTitle"
                defaultValue={telegram.telegramCatalogTitle}
                placeholder="Toko Akun Digital"
              />
              <div className="grid gap-2">
                <Label htmlFor="telegramForceJoinChannel">
                  Channel Wajib Join (@username atau -100...)
                </Label>
                <Textarea
                  id="telegramForceJoinChannel"
                  name="telegramForceJoinChannel"
                  rows={3}
                  defaultValue={telegram.telegramForceJoinChannel}
                  placeholder={"@lapakloka\n@lapakloka_store\n-1001234567890"}
                />
                <p className="text-xs text-muted-foreground">
                  Bisa lebih dari satu — satu per baris (atau pisah koma). Buyer harus
                  join <span className="font-medium">semua</span> channel yang terdaftar.
                  Bot harus admin di tiap channel agar bisa cek membership.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-6">
              <ToggleField
                label="Wajib join channel sebelum lihat katalog"
                name="telegramForceJoinEnabled"
                defaultChecked={telegram.telegramForceJoinEnabled}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Kalau aktif, buyer yang belum join channel akan ditahan sebelum katalog
              tampil. Bot harus admin channel agar bisa cek membership (getChatMember).
              Judul kosong = ikut judul embed Discord.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cara memasang bot ke channel log</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-muted-foreground">
            <p>1. Buat channel (atau pakai yang sudah ada), lalu buka Channel Settings → Administrators.</p>
            <p>2. Tambahkan bot{telegram.telegramBotUsername ? ` @${telegram.telegramBotUsername}` : " kamu"} sebagai admin (cukup izin kirim pesan).</p>
            <p>3. Chat ID channel akan terisi otomatis di kolom di atas begitu bot ditambahkan — tidak perlu cari manual.</p>
            <p>4. Kalau ingin manual: jadikan channel publik, lalu isi <code>@username</code>-nya.</p>
            <p>
              Chat ID terdeteksi: <span className="font-mono text-foreground">{telegram.telegramAdminChannelId || "belum ada"}</span>
            </p>
          </CardContent>
        </Card>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" form="telegram-settings-form">
          Save Settings
        </Button>
        <form action={testTelegramAction}>
          <input type="hidden" name="redirectTo" value="/admin/settings/telegram" />
          <Button variant="outline" type="submit">
            Test Connection
          </Button>
        </form>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  hint?: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={defaultValue} placeholder={placeholder} />
      {hint ? (
        <div className="grid gap-1 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}
