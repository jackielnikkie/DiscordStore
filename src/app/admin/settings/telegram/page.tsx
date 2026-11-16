import { AppShell } from "../../../../components/app-shell";
import { Notice } from "../../../../components/notice";
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
                defaultValue={telegram.telegramEnabled}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Katalog dikirim bot langsung di chat pribadi buyer (/start). Chat ID di atas
              hanya dipakai untuk buy alert &amp; tes pesan.
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

function ToggleField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: boolean;
}) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultValue}
        className="peer sr-only"
      />
      <div className="relative h-[24px] w-[44px] shrink-0 rounded-full border-2 border-transparent bg-input shadow-sm transition-colors peer-checked:bg-primary peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 peer-focus-visible:outline-primary">
        <div className="pointer-events-none block size-[18px] rounded-full bg-primary-foreground shadow-sm transition-transform peer-checked:translate-x-5 peer-not-checked:translate-x-0" />
      </div>
      <span>{label}</span>
    </label>
  );
}
