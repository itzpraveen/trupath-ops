"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const TABS = [
  ["/settings", "Company"],
  ["/settings/users", "Logins"],
  ["/settings/shopify", "Shopify"],
  ["/settings/lists", "Lists & brands"],
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="mt-4 flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm" aria-label="Settings">
      {TABS.map(([href, label]) => (
        <Link key={href} href={href} className={cn("rounded-md px-3 py-1", pathname === href ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
