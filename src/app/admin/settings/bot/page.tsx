import { AppShell } from "../../../../components/app-shell";
import { Notice } from "../../../../components/notice";
import { maskSecret, getAllSettings } from "../../../../lib/settings";
import { saveBotSettingsAction, syncEmbedAction, testDiscordAction } from "../../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default async function BotSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, settings] = await Promise.all([searchParams, getAllSettings()]);

  return (
    <AppShell
      title="Bot Settings"
      description="Semua konfigurasi worker Discord ada di sini."
    >
      <Notice
        message={typeof params.message === "string" ? params.message : undefined}
        error={typeof params.error === "string" ? params.error : undefined}
      />

      <form
        id="bot-settings-form"
        action={saveBotSettingsAction}
        className="space-y-6"
      >
        <input type="hidden" name="redirectTo" value="/admin/settings/bot" />

        <Card>
          <CardHeader><CardTitle>Bot Configuration</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Discord Bot Token" name="discordBotToken" defaultValue="" placeholder={settings.bot.discordBotToken ? maskSecret(settings.bot.discordBotToken) : ""} />
              <Field label="Client ID" name="discordClientId" defaultValue={settings.bot.discordClientId} />
              <Field label="Guild ID" name="discordGuildId" defaultValue={settings.bot.discordGuildId} />
              <Field label="Auto-Order Channel ID" name="autoOrderChannelId" defaultValue={settings.bot.autoOrderChannelId} />
              <Field label="Buy Alert Channel ID" name="buyAlertChannelId" defaultValue={settings.bot.buyAlertChannelId} />
              <Field label="Admin Role ID" name="adminRoleId" defaultValue={settings.bot.adminRoleId} />
            </div>
            <div className="flex flex-wrap gap-6">
              <ToggleField label="Enable buy alert" name="enableBuyAlert" defaultValue={settings.bot.enableBuyAlert} />
              <ToggleField label="Enable auto sync embed" name="enableAutoSyncEmbed" defaultValue={settings.bot.enableAutoSyncEmbed} />
            </div>
          </CardContent>
        </Card>

      </form>

      <div className="flex items-center gap-3 flex-wrap">
        <Button type="submit" form="bot-settings-form">Save Settings</Button>
        <form action={testDiscordAction}>
          <input type="hidden" name="redirectTo" value="/admin/settings/bot" />
          <Button variant="outline" type="submit">Test Connection</Button>
        </form>
        <form action={syncEmbedAction}>
          <input type="hidden" name="redirectTo" value="/admin/settings/bot" />
          <Button variant="secondary" type="submit">Sync Auto-Order Embed</Button>
        </form>
      </div>
    </AppShell>
  );
}

function Field({ label, name, defaultValue, placeholder }: { label: string; name: string; defaultValue?: string; placeholder?: string }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={defaultValue} placeholder={placeholder} />
    </div>
  );
}

function ToggleField({ label, name, defaultValue }: { label: string; name: string; defaultValue: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultValue}
        className="peer sr-only"
      />
      <div className="relative h-[24px] w-[44px] shrink-0 rounded-full border-2 border-transparent bg-input shadow-sm transition-colors peer-checked:bg-primary peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 peer-focus-visible:outline-primary cursor-pointer">
        <div className="pointer-events-none block size-[18px] rounded-full bg-primary-foreground shadow-sm transition-transform peer-checked:translate-x-5 peer-not-checked:translate-x-0" />
      </div>
      <span>{label}</span>
    </label>
  );
}
