import { describe, expect, it } from "vitest";
import { activeHref, bottomNavForRole, navForRole } from "@/components/app/nav";
import { canEdit, canView, MODULES, ROLE_HOME, type ModuleKey } from "@/lib/permissions";
import { ROLES } from "@/db/schema";

describe("roles", () => {
  it("owner can open and change everything", () => {
    for (const m of Object.keys(MODULES) as ModuleKey[]) {
      expect(canView("owner", m)).toBe(true);
      if (MODULES[m].edit.length) expect(canEdit("owner", m)).toBe(true);
    }
  });
  it("factory staff never see money or settings", () => {
    for (const m of ["sales", "payments", "reports", "settings"] as ModuleKey[]) expect(canView("factory", m)).toBe(false);
    expect(canView("factory", "factory")).toBe(true);
    expect(canEdit("factory", "stock")).toBe(true);
  });
  it("accounts can see job work but not change it", () => {
    expect(canView("accounts", "jobwork")).toBe(true);
    expect(canEdit("accounts", "jobwork")).toBe(false);
  });
  it("editing implies viewing", () => {
    for (const m of Object.keys(MODULES) as ModuleKey[]) for (const r of MODULES[m].edit) expect(MODULES[m].view).toContain(r);
  });
});

describe("navigation", () => {
  it("only lists modules the role may open", () => {
    for (const role of ROLES) {
      for (const g of navForRole(role)) for (const i of g.items) expect(canView(role, i.module)).toBe(true);
      for (const i of bottomNavForRole(role)) expect(canView(role, i.module)).toBe(true);
      expect(navForRole(role).flatMap((g) => g.items).some((i) => i.href === ROLE_HOME[role])).toBe(true);
    }
    expect(navForRole("factory").flatMap((g) => g.items).map((i) => i.href)).not.toContain("/sales");
  });
  it("highlights the most specific item", () => {
    const items = navForRole("owner").flatMap((g) => g.items);
    expect(activeHref("/factory/materials/abc", items)).toBe("/factory/materials");
    expect(activeHref("/factory", items)).toBe("/factory");
    expect(activeHref("/factory/production", items)).toBe("/factory/production");
    expect(activeHref("/", items)).toBe("/");
    expect(activeHref("/nowhere", items)).toBeNull();
  });
});
