import { AppShell } from "../../../../components/app-shell";
import { Notice } from "../../../../components/notice";
import { getAllSettings } from "../../../../lib/settings";
import { saveTextSettingsAction } from "../../actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export default async function TextSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, settings] = await Promise.all([searchParams, getAllSettings()]);

  return (
    <AppShell
      title="Text Templates"
      description="Edit seluruh template DM, warning, dan buy-alert yang dipakai bot."
    >
      <Notice
        message={typeof params.message === "string" ? params.message : undefined}
        error={typeof params.error === "string" ? params.error : undefined}
      />

      <form action={saveTextSettingsAction} className="space-y-6">
        <input type="hidden" name="redirectTo" value="/admin/settings/text" />
        
        <Card>
          <CardHeader><CardTitle>DM Templates</CardTitle><CardDescription>Pesan DM untuk berbagai situasi</CardDescription></CardHeader>
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

        <Button type="submit" className="w-full md:w-auto">Save Templates</Button>
      </form>
    </AppShell>
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
