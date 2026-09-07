"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import type { Role } from "@/db/schema";
import { activeHref, navForRole } from "./nav";

export function SidebarNav({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = navForRole(role);
  const active = activeHref(pathname, groups.flatMap((g) => g.items));
  return (
    <nav aria-label="Main" className="flex flex-col gap-5 px-3 py-4">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="px-3 pb-1.5 text-xs font-medium text-sidebar-foreground/55">{group.title}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const isActive = active === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-sidebar-ring",
                      isActive && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                    )}
                  >
                    <item.icon className={cn("size-4 shrink-0", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/60")} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
