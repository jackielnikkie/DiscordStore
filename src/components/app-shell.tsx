import Link from "next/link";
import { Settings, Package, ShoppingCart, CreditCard, Bot, LogOut, LayoutDashboard } from "lucide-react";

import { logoutAction } from "../app/admin/actions";
import { requireAdminSession } from "../lib/auth";
import { STORE_NAME, APP_VERSION } from "../lib/brand";
import { detectPaymenkuMode, getAllSettings } from "../lib/settings";
import { isFresh } from "../lib/status";
import { SettingsGroupMenu } from "./settings-group-menu";
import { StatusPill } from "./status-pill";
import { LazyThemeToggle } from "@/components/ui/lazy-theme-toggle";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
];

const settingsItems = [
  { href: "/admin/settings/account", label: "Account", icon: Settings },
];

type AppShellProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export async function AppShell({ title, description, actions, children }: AppShellProps) {
  const [session, settings] = await Promise.all([
    requireAdminSession(),
    getAllSettings(),
  ]);
  const botOnline =
    settings.bot.botReadyState.startsWith("online") &&
    isFresh(settings.bot.botLastHeartbeatAt, 90_000);
  const telegramOnline =
    settings.telegram.telegramReadyState.startsWith("online") &&
    isFresh(settings.telegram.telegramLastHeartbeatAt, 180_000);
  const paymenkuMode = detectPaymenkuMode(settings.payment.paymenkuApiKey);

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" side="left">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <a href="/admin">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <Bot className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{STORE_NAME}</span>
                    <span className="truncate text-xs">Admin Panel · v{APP_VERSION}</span>
                  </div>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarRail />
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Main Menu</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild>
                      <Link href={item.href}>
                        <item.icon className="size-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Settings</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SettingsGroupMenu group="bot" />
                <SettingsGroupMenu group="payment" />
                {settingsItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild>
                      <Link href={item.href}>
                        <item.icon className="size-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <form action={logoutAction} className="flex items-center gap-2">
                  <LogOut className="size-4" />
                  <span>Logout</span>
                </form>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="flex flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="md:hidden" />
          <div className="flex-1" />
          <Badge variant="outline" className="hidden sm:flex">
            {paymenkuMode === "production" ? "Live" : "Sandbox"}
          </Badge>
          <StatusPill
            label={`Discord ${botOnline ? "Online" : "Offline"}`}
            tone={botOnline ? "success" : "neutral"}
          />
          <StatusPill
            label={`Telegram ${telegramOnline ? "Online" : "Offline"}`}
            tone={telegramOnline ? "success" : "neutral"}
          />
          <LazyThemeToggle />
        </header>
        <main className="flex-1 space-y-5 p-4 md:p-6">
          <div className="space-y-1">
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">{title}</h1>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex justify-end">{actions}</div>}
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
