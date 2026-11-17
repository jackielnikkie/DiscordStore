import { AppShell } from "../../../../components/app-shell";
import { Notice } from "../../../../components/notice";
import { ToggleField } from "../../../../components/toggle-field";
import { maskSecret, getAllSettings } from "../../../../lib/settings";
import { SavedState, StatusGrid, StatusTile, WarningList } from "../../../../components/settings-status";
import { formatRelativeTime, isFresh } from "../../../../lib/status";
import {
  saveBotSettingsAction,
  saveEmbedSettingsAction,
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
  const bot = settings.bot;
  const hasToken = Boolean(bot.discordBotToken);
  const stateLabel = (bot.botReadyState || "offline").split(":")[0];
  const online = stateLabel.startsWith("online") && isFresh(bot.botLastHeartbeatAt, 90_000);
  const botTone: "success" | "warning" | "neutral" = online
    ? "success"
    : hasToken && stateLabel.startsWith("offline")
      ? "warning"
      : "neutral";

  const embedValue = !hasToken
    ? "Bot belum aktif"
    : bot.autoOrderChannelId
      ? "Siap"
      : "Channel belum diatur";
  const embedTone: "success" | "warning" | "neutral" = !hasToken
    ? "neutral"
    : bot.autoOrderChannelId
      ? "success"
      : "warning";

  const alertReady = bot.enableBuyAlert && Boolean(bot.buyAlertChannelId);
  const alertTone: "success" | "warning" | "neutral" = alertReady
    ? "success"
    : bot.enableBuyAlert
      ? "warning"
      : "neutral";

  const warnings: string[] = [];
  if (!hasToken) {
    warnings.push("Token bot Discord belum diisi — worker Discord idle.");
  }
  if (hasToken && !bot.autoOrderChannelId) {
    warnings.push("Channel auto-order belum diatur — embed katalog tidak akan muncul.");
  }
  if (hasToken && bot.enableBuyAlert && !bot.buyAlertChannelId) {
    warnings.push("Buy alert aktif tapi channel buy alert kosong.");
  }
  if (hasToken && bot.enableAutoSyncEmbed && !bot.autoOrderChannelId) {
    warnings.push("Auto sync embed aktif tapi channel auto-order kosong.");
  }

  return (
    <AppShell
      title="Discord Bot Settings"
      description="Konfigurasi worker Discord, template teks, dan embed katalog."
    >
      <Notice
        message={typeof params.message === "string" ? params.message : undefined}
        error={typeof params.error === "string" ? params.error : undefined}
      />

      <Card>
        <CardHeader>
          <CardTitle>Ringkasan Status</CardTitle>
          <CardDescription>Kondisi worker Discord dan kanal saat ini.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <StatusGrid>
            <StatusTile
              label="Bot Discord"
              value={stateLabel}
              tone={botTone}
              hint={`heartbeat ${formatRelativeTime(bot.botLastHeartbeatAt)}`}
            />
            <StatusTile
              label="Token Bot"
              value={hasToken ? "Tersimpan" : "Belum diisi"}
              tone={hasToken ? "success" : "neutral"}
              hint={hasToken ? maskSecret(bot.discordBotToken) : undefined}
            />
            <StatusTile
              label="Embed Auto-Order"
              value={embedValue}
              tone={embedTone}
              hint={`sync ${bot.enableAutoSyncEmbed ? "aktif" : "nonaktif"}`}
            />
            <StatusTile
              label="Buy Alert"
              value={bot.buyAlertChannelId || "belum diatur"}
              tone={alertTone}
              hint={bot.enableBuyAlert ? "alert aktif" : "alert nonaktif"}
            />
          </StatusGrid>
          <WarningList items={warnings} />
        </CardContent>
      </Card>

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
              <Field
                label="Discord Bot Token"
                name="discordBotToken"
                defaultValue=""
                placeholder={bot.discordBotToken ? maskSecret(bot.discordBotToken) : ""}
              >
                <SavedState saved={hasToken} masked={hasToken ? maskSecret(bot.discordBotToken) : undefined} />
                <p className="text-xs text-muted-foreground">
                  Kosongkan field untuk mempertahankan token yang tersimpan.
                </p>
              </Field>
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
            <p className="text-xs text-muted-foreground">
              Perubahan toggle langsung dipakai worker dalam ±20 detik.
            </p>
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

      <form id="embed-settings-form" action={saveEmbedSettingsAction} className="space-y-6">
        <input type="hidden" name="redirectTo" value="/admin/settings/bot" />

        <Card>
          <CardHeader>
            <CardTitle>Discord Embed Message</CardTitle>
            <CardDescription>Pesan auto-order Discord embed</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="embedTitle">Embed Title</Label>
              <Input id="embedTitle" name="embedTitle" defaultValue={settings.text.embedTitle} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="embedDescription">Embed Description</Label>
              <Textarea id="embedDescription" name="embedDescription" defaultValue={settings.text.embedDescription} rows={4} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="embedFooter">Embed Footer</Label>
              <Input id="embedFooter" name="embedFooter" defaultValue={settings.text.embedFooter} />
            </div>
          </CardContent>
        </Card>

        <Button type="submit">Save Embed</Button>
      </form>
    </AppShell>
  );
}

function Field({ label, name, defaultValue, placeholder, children }: { label: string; name: string; defaultValue?: string; placeholder?: string; children?: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={defaultValue} placeholder={placeholder} />
      {children}
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
