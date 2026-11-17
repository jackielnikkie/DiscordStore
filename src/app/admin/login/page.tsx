import { redirect } from "next/navigation";

import { loginAction } from "../actions";
import { getAdminSession } from "../../../lib/auth";
import { STORE_NAME } from "../../../lib/brand";
import { Notice } from "../../../components/notice";
import { LazyThemeToggle } from "../../../components/ui/lazy-theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, params] = await Promise.all([getAdminSession(), searchParams]);

  if (session) {
    redirect("/admin");
  }

  const message = typeof params.message === "string" ? params.message : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <LazyThemeToggle />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <CardTitle className="text-2xl md:text-3xl font-bold">{STORE_NAME}</CardTitle>
          <CardDescription className="text-sm">
            Masukan username dan password admin untuk melanjutkan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={loginAction} className="grid gap-5">
            <Notice message={message} error={error} />

            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                placeholder="admin"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                required
              />
            </div>

            <Button type="submit" className="w-full">
              Login
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
