"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  ChevronRight,
  CreditCard,
  MessageSquare,
  Send,
  Wallet,
} from "lucide-react";

import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const groups = {
  bot: {
    label: "Bot",
    icon: Bot,
    items: [
      { href: "/admin/settings/bot", label: "Discord", icon: MessageSquare },
      { href: "/admin/settings/telegram", label: "Telegram", icon: Send },
    ],
  },
  payment: {
    label: "Payment",
    icon: CreditCard,
    items: [
      { href: "/admin/settings/payment", label: "Paymenku", icon: Wallet },
    ],
  },
} as const;

export function SettingsGroupMenu({ group }: { group: keyof typeof groups }) {
  const pathname = usePathname();
  const { label, icon: Icon, items } = groups[group];
  const hasActiveChild = items.some((item) => pathname.startsWith(item.href));
  const [open, setOpen] = useState(hasActiveChild);

  useEffect(() => {
    if (hasActiveChild) {
      setOpen(true);
    }
  }, [hasActiveChild]);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={label}
        isActive={hasActiveChild}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon className="size-4" />
        <span>{label}</span>
        <ChevronRight
          className={cn(
            "ml-auto size-4 transition-transform",
            open && "rotate-90",
          )}
        />
      </SidebarMenuButton>
      {open && (
        <SidebarMenuSub>
          {items.map((item) => (
            <SidebarMenuSubItem key={item.href}>
              <SidebarMenuSubButton asChild isActive={pathname === item.href}>
                <Link href={item.href}>
                  <item.icon className="size-4" />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}
