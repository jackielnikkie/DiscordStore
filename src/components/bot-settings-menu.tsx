"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, ChevronRight, MessageSquare, Send } from "lucide-react";

import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const botItems = [
  { href: "/admin/settings/bot", label: "Discord", icon: MessageSquare },
  { href: "/admin/settings/telegram", label: "Telegram", icon: Send },
];

export function BotSettingsMenu() {
  const pathname = usePathname();
  const isBotRoute = botItems.some((item) => pathname.startsWith(item.href));
  const [open, setOpen] = useState(isBotRoute);

  useEffect(() => {
    if (isBotRoute) {
      setOpen(true);
    }
  }, [isBotRoute]);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip="Bot"
        isActive={isBotRoute}
        onClick={() => setOpen((value) => !value)}
      >
        <Bot className="size-4" />
        <span>Bot</span>
        <ChevronRight
          className={cn(
            "ml-auto size-4 transition-transform",
            open && "rotate-90",
          )}
        />
      </SidebarMenuButton>
      {open && (
        <SidebarMenuSub>
          {botItems.map((item) => (
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
