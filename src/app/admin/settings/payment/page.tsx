import { AppShell } from "../../../../components/app-shell";
import { Notice } from "../../../../components/notice";
import { detectPaymenkuMode, getAllSettings, getWebhookUrl } from "../../../../lib/settings";
import { savePaymentSettingsAction, testPaymenkuAction } from "../../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const mode = detectPaymenkuMode(settings.payment.paymenkuApiKey);
  const webhookUrl = getWebhookUrl();

  return (
    <AppShell
      title="Payment Settings"
      description="Konfigurasi Paymenku QRIS, webhook secret, dan return URL."
    >
      <Notice
        message={typeof params.message === "string" ? params.message : undefined}
        error={typeof params.error === "string" ? params.error : undefined}
      />

      <form
        id="payment-settings-form"
        action={savePaymentSettingsAction}
        className="space-y-6"
      >
        <input type="hidden" name="redirectTo" value="/admin/settings/payment" />

        <Card>
          <CardHeader>
            <CardTitle>Paymenku Configuration</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="paymenkuApiKey">Paymenku API Key</Label>
              <Input id="paymenkuApiKey" name="paymenkuApiKey" defaultValue="" placeholder={settings.payment.paymenkuApiKey ? "••••••••••••..." : ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="paymenkuWebhookSecret">Webhook Secret</Label>
              <Input id="paymenkuWebhookSecret" name="paymenkuWebhookSecret" defaultValue="" placeholder={settings.payment.paymenkuWebhookSecret ? "••••••••••••..." : ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="paymenkuChannelCode">Channel Code</Label>
              <Input id="paymenkuChannelCode" name="paymenkuChannelCode" defaultValue={settings.payment.paymenkuChannelCode} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="returnUrl">Return URL</Label>
              <Input id="returnUrl" name="returnUrl" defaultValue={settings.payment.returnUrl} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="webhookUrl">Webhook URL</Label>
              <Input id="webhookUrl" name="webhookUrl" defaultValue={webhookUrl} readOnly />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="detectedMode">Detected Mode</Label>
              <div className="flex h-9 items-center rounded-md border border-border bg-muted/50 px-3 py-1 text-sm">
                <Badge variant={mode === "production" ? "default" : mode === "sandbox" ? "outline" : "secondary"}>
                  {mode}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

      </form>

      <div className="flex items-center gap-3">
        <Button type="submit" form="payment-settings-form">Save Settings</Button>
        <form action={testPaymenkuAction}>
          <input type="hidden" name="redirectTo" value="/admin/settings/payment" />
          <Button variant="outline" type="submit">Test API Key Format</Button>
        </form>
      </div>
    </AppShell>
  );
}
