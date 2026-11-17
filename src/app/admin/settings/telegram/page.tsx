import { AppShell } from "../../../../components/app-shell";
import { Notice } from "../../../../components/notice";
import { ToggleField } from "../../../../components/toggle-field";
import { getAllSettings, maskSecret } from "../../../../lib/settings";
import {
  saveTelegramSettingsAction,
  testTelegramAction,
} from "../../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default async function TelegramSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, settings] = await Promise.all([searchParams, getAllSettings()]);
  const telegram = settings.telegram;

  return (
    <AppShell
      title="Telegram Settings"
      description="Storefront Telegram: katalog, invoice QRIS, dan delivery otomatis lewat chat bot."
    >
      <Notice
        message={typeof params.message === "string" ? params.message : undefined}
        error={typeof params.error === "string" ? params.error : undefined}
      />

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
              {telegram.telegramLastHeartbeatAt
                ? ` • heartbeat ${telegram.telegramLastHeartbeatAt}`
                : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Katalog &amp; Gate Join</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Judul Katalog Telegram"
                name="telegramCatalogTitle"
                defaultValue={telegram.telegramCatalogTitle}
                placeholder="Toko Akun Digital"
              />
              <Field
                label="Channel Wajib Join (@username atau -100...)"
                name="telegramForceJoinChannel"
                defaultValue={telegram.telegramForceJoinChannel}
                placeholder="@lapakloka atau -1001234567890"
              />
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
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={defaultValue} placeholder={placeholder} />
    </div>
  );
}
