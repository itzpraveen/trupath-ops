import type { Role } from "@/db/schema";

export type ModuleKey =
  | "dashboard"
  | "sales"
  | "orders"
  | "products"
  | "stock"
  | "dispatch"
  | "factory"
  | "materials"
  | "attendance"
  | "jobwork"
  | "contacts"
  | "payments"
  | "reports"
  | "settings";

const ALL: Role[] = ["owner", "accounts", "factory", "inventory"];

/** Who may open a module (view) and who may change data in it (edit). */
export const MODULES: Record<ModuleKey, { view: Role[]; edit: Role[] }> = {
  dashboard: { view: ALL, edit: [] },
  sales: { view: ["owner", "accounts"], edit: ["owner", "accounts"] },
  orders: { view: ["owner", "accounts", "inventory"], edit: ["owner", "accounts", "inventory"] },
  products: { view: ALL, edit: ["owner", "accounts", "inventory"] },
  stock: { view: ALL, edit: ["owner", "inventory", "factory"] },
  dispatch: { view: ["owner", "accounts", "inventory"], edit: ["owner", "inventory", "accounts"] },
  factory: { view: ["owner", "factory"], edit: ["owner", "factory"] },
  materials: { view: ["owner", "factory"], edit: ["owner", "factory"] },
  attendance: { view: ["owner", "factory"], edit: ["owner", "factory"] },
  jobwork: { view: ["owner", "factory", "accounts"], edit: ["owner", "factory"] },
  contacts: { view: ALL, edit: ["owner", "accounts", "factory"] },
  payments: { view: ["owner", "accounts"], edit: ["owner", "accounts"] },
  reports: { view: ["owner", "accounts"], edit: [] },
  settings: { view: ["owner"], edit: ["owner"] },
};

export function canView(role: Role, module: ModuleKey) {
  return MODULES[module].view.includes(role);
}
export function canEdit(role: Role, module: ModuleKey) {
  return MODULES[module].edit.includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  accounts: "Accounts",
  factory: "Factory",
  inventory: "Inventory & dispatch",
};

/** Where each role lands after login. */
export const ROLE_HOME: Record<Role, string> = {
  owner: "/",
  accounts: "/",
  factory: "/factory",
  inventory: "/stock",
};
