import { AppShell } from "../../../../components/app-shell";
import { Notice } from "../../../../components/notice";
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  getAdminSession,
} from "../../../../lib/auth";
import { changePasswordAction } from "../../actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, session] = await Promise.all([searchParams, getAdminSession()]);

  return (
    <AppShell
      title="Account & Security"
      description="Kelola password, sesi login, dan preferensi tampilan Anda."
    >
      <Notice
        message={typeof params.message === "string" ? params.message : undefined}
        error={typeof params.error === "string" ? params.error : undefined}
      />

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Password</CardTitle>
            <CardDescription>Kelola keamanan akun admin Anda.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={changePasswordAction} className="grid gap-3">
              <input type="hidden" name="redirectTo" value="/admin/settings/account" />
              <div className="grid gap-1.5">
                <Label htmlFor="currentPassword">Password saat ini</Label>
                <Input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  placeholder="Password saat ini"
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="password">Password baru</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder={`Minimal ${ADMIN_PASSWORD_MIN_LENGTH} karakter`}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="confirmPassword">Ulangi password baru</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="Ulangi password baru"
                  required
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full">Change Password</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Login Info</CardTitle>
            <CardDescription>Detail sesi login saat ini.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Username</p>
              <p className="font-medium">{session?.username ?? "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Session expires at</p>
              <p className="font-mono text-xs text-muted-foreground">
                {session?.expiresAt ? new Date(session.expiresAt).toLocaleString() : "-"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
