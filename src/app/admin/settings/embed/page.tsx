import { AppShell } from "../../../../components/app-shell";
import { Notice } from "../../../../components/notice";
import { getAllSettings } from "../../../../lib/settings";
import { saveEmbedSettingsAction } from "../../actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export default async function EmbedSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, settings] = await Promise.all([searchParams, getAllSettings()]);

  return (
    <AppShell
      title="Embed Settings"
      description="Atur title, description, dan footer untuk message auto-order Discord."
    >
      <Notice
        message={typeof params.message === "string" ? params.message : undefined}
        error={typeof params.error === "string" ? params.error : undefined}
      />

      <form action={saveEmbedSettingsAction} className="space-y-6">
        <input type="hidden" name="redirectTo" value="/admin/settings/embed" />
        
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

        <Button type="submit" className="w-full md:w-auto">Save Embed</Button>
      </form>
    </AppShell>
  );
}