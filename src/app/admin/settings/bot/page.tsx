import { AppShell } from "../../../../components/app-shell";
import { Notice } from "../../../../components/notice";
import { ToggleField } from "../../../../components/toggle-field";
import { maskSecret, getAllSettings } from "../../../../lib/settings";
import {
  saveBotSettingsAction,
  saveTextSettingsAction,
  syncEmbedAction,
  testDiscordAction,
} from "../../actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
      description="Konfigurasi worker Discord dan template teks yang dipakai bot."
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
              <ToggleField label="Enable buy alert" name="enableBuyAlert" defaultChecked={settings.bot.enableBuyAlert} />
              <ToggleField label="Enable auto sync embed" name="enableAutoSyncEmbed" defaultChecked={settings.bot.enableAutoSyncEmbed} />
            </div>
          </CardContent>
        </Card>

        <Button type="submit">Save Settings</Button>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <form action={testDiscordAction}>
          <input type="hidden" name="redirectTo" value="/admin/settings/bot" />
          <Button variant="outline" type="submit">Test Connection</Button>
        </form>
        <form action={syncEmbedAction}>
          <input type="hidden" name="redirectTo" value="/admin/settings/bot" />
          <Button variant="secondary" type="submit">Sync Auto-Order Embed</Button>
        </form>
      </div>

      <form id="text-settings-form" action={saveTextSettingsAction} className="space-y-6">
        <input type="hidden" name="redirectTo" value="/admin/settings/bot" />

        <Card>
          <CardHeader>
            <CardTitle>Text Templates</CardTitle>
            <CardDescription>Pesan DM untuk berbagai situasi</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Area label="DM Test Text" name="dmTestText" defaultValue={settings.text.dmTestText} />
            <Area
              label="DM Invoice"
              name="dmInvoiceText"
              defaultValue={settings.text.dmInvoiceText}
              minRows={10}
            />
            <Area
              label="DM Payment Success"
              name="dmPaymentSuccessText"
              defaultValue={settings.text.dmPaymentSuccessText}
              minRows={10}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Area label="DM Expired" name="dmExpiredText" defaultValue={settings.text.dmExpiredText} />
              <Area label="DM Failed" name="dmFailedText" defaultValue={settings.text.dmFailedText} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Area label="Warning DM Closed" name="warningDmClosed" defaultValue={settings.text.warningDmClosed} />
              <Area label="Warning Stock Empty" name="warningStockEmpty" defaultValue={settings.text.warningStockEmpty} />
            </div>
            <Area
              label="Buy Alert Template"
              name="buyAlertTemplate"
              defaultValue={settings.text.buyAlertTemplate}
              hint="Gunakan {{user}} untuk tag Discord langsung."
            />
          </CardContent>
        </Card>

        <Button type="submit">Save Templates</Button>
      </form>
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

function Area({
  label,
  name,
  defaultValue,
  minRows = 3,
  hint,
}: {
  label: string;
  name: string;
  defaultValue: string;
  minRows?: number;
  hint?: string;
}) {
  const rows = Math.max(
    minRows,
    defaultValue.split(/\r?\n/).filter(Boolean).length + 1,
  );

  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Textarea id={name} name={name} defaultValue={defaultValue} rows={rows} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
