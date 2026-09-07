"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import type { Role } from "@/db/schema";
import { activeHref, bottomNavForRole } from "./nav";

export function BottomNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = bottomNavForRole(role);
  const active = activeHref(pathname, items);
  if (!items.length) return null;
  return (
    <nav
      aria-label="Quick"
      className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-card/95 backdrop-blur md:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map((item) => {
        const isActive = active === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground",
              isActive && "text-primary",
            )}
          >
            <item.icon className="size-5" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
