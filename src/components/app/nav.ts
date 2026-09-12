import {
  Boxes,
  CalendarCheck,
  ChartColumn,
  ClipboardList,
  Contact,
  Factory,
  Hammer,
  IndianRupee,
  LayoutDashboard,
  Layers,
  ListChecks,
  Package,
  Scissors,
  Settings,
  ShoppingBag,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/db/schema";
import { canView, type ModuleKey } from "@/lib/permissions";

export type NavItem = { href: string; label: string; icon: LucideIcon; module: ModuleKey; exact?: boolean };
export type NavGroup = { title: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { title: "Overview", items: [{ href: "/", label: "Home", icon: LayoutDashboard, module: "dashboard", exact: true }] },
  {
    title: "Sales & money",
    items: [
      { href: "/sales", label: "Sales & expenses", icon: IndianRupee, module: "sales" },
      { href: "/orders", label: "Website orders", icon: ShoppingBag, module: "orders" },
      { href: "/payments", label: "Payments", icon: Wallet, module: "payments" },
      { href: "/contacts", label: "Customers & vendors", icon: Contact, module: "contacts" },
      { href: "/reports", label: "Reports", icon: ChartColumn, module: "reports" },
    ],
  },
  {
    title: "Stock & dispatch",
    items: [
      { href: "/stock", label: "Finished stock", icon: Boxes, module: "stock" },
      { href: "/products", label: "Products", icon: Package, module: "products" },
      { href: "/dispatch", label: "Dispatch", icon: Truck, module: "dispatch" },
    ],
  },
  {
    title: "Factory",
    items: [
      { href: "/factory", label: "Daily register", icon: Factory, module: "factory", exact: true },
      { href: "/factory/plan", label: "Production plan", icon: ClipboardList, module: "factory" },
      { href: "/factory/production", label: "Production", icon: Hammer, module: "factory" },
      { href: "/factory/materials", label: "Raw materials", icon: Layers, module: "materials" },
      { href: "/factory/boms", label: "Material recipes", icon: ListChecks, module: "materials" },
      { href: "/factory/attendance", label: "Attendance", icon: CalendarCheck, module: "attendance" },
      { href: "/factory/employees", label: "Staff", icon: Users, module: "attendance" },
      { href: "/jobwork", label: "Job work", icon: Scissors, module: "jobwork" },
    ],
  },
  { title: "Admin", items: [{ href: "/settings", label: "Settings", icon: Settings, module: "settings" }] },
];

export function navForRole(role: Role): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => canView(role, i.module)) })).filter((g) => g.items.length > 0);
}

const BOTTOM: Record<Role, string[]> = {
  owner: ["/", "/sales", "/orders", "/stock"],
  accounts: ["/", "/sales", "/orders", "/payments"],
  factory: ["/factory", "/factory/materials", "/factory/attendance", "/jobwork"],
  inventory: ["/stock", "/dispatch", "/orders", "/products"],
};

export function bottomNavForRole(role: Role): NavItem[] {
  const all = NAV.flatMap((g) => g.items);
  return BOTTOM[role].map((href) => all.find((i) => i.href === href)).filter((i): i is NavItem => !!i && canView(role, i.module));
}

/** The most specific nav item matching a pathname. */
export function activeHref(pathname: string, items: NavItem[]): string | null {
  let best: NavItem | null = null;
  for (const item of items) {
    const match = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
    if (match && (!best || item.href.length > best.href.length)) best = item;
  }
  return best?.href ?? null;
}
