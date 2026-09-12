import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { bomLines, boms, materials, productionEntries, productionPlans, products, type ProductionPlan, type ProductionPlanStatus } from "@/db/schema";
import { materialRequirement, maxMakeable, requirementCostP, type RecipeLine, type Requirement } from "@/lib/production-plan";

export type ActiveRecipe = {
  bomId: string;
  productId: string;
  version: string;
  labourCostP: number;
  lines: RecipeLine[];
  /** Pieces the current material stock supports. */
  canMake: number;
};

/** The in-use recipe of every product that has one, with live material balances. */
export async function activeRecipes(productIds?: string[]): Promise<Map<string, ActiveRecipe>> {
  if (productIds && !productIds.length) return new Map();
  const rows = await db
    .select({
      bomId: boms.id,
      productId: boms.productId,
      version: boms.version,
      labourCostP: boms.labourCostP,
      materialId: bomLines.materialId,
      qtyPerUnit: bomLines.qtyPerUnit,
      wastagePct: bomLines.wastagePct,
      name: materials.name,
      unit: materials.unit,
      costP: materials.costP,
      inStock: materials.qty,
    })
    .from(boms)
    .innerJoin(bomLines, eq(bomLines.bomId, boms.id))
    .innerJoin(materials, eq(materials.id, bomLines.materialId))
    .where(and(eq(boms.active, true), productIds ? inArray(boms.productId, productIds) : undefined))
    .orderBy(asc(materials.code));

  const byProduct = new Map<string, ActiveRecipe>();
  for (const r of rows) {
    const recipe = byProduct.get(r.productId) ?? { bomId: r.bomId, productId: r.productId, version: r.version, labourCostP: r.labourCostP, lines: [], canMake: 0 };
    recipe.lines.push({ materialId: r.materialId, name: r.name, unit: r.unit, qtyPerUnit: r.qtyPerUnit, wastagePct: r.wastagePct, costP: r.costP, inStock: r.inStock });
    byProduct.set(r.productId, recipe);
  }
  for (const recipe of byProduct.values()) recipe.canMake = maxMakeable(recipe.lines);
  return byProduct;
}

export type PlanRow = {
  plan: ProductionPlan;
  name: string;
  variant: string;
  /** Pieces recorded against the plan, whatever QC said. */
  made: number;
  accepted: number;
  rejected: number;
  awaitingQc: number;
  /** Still to be made: rejected pieces come back into this. */
  remaining: number;
  recipe: ActiveRecipe | null;
  /** What the remaining pieces still need from the store. */
  requirement: Requirement[];
  shortCount: number;
  remainingCostP: number;
  overdue: boolean;
};

/** Plans with their production progress and what the unmade pieces still need. */
export async function planRows(opts: { status?: ProductionPlanStatus[]; limit?: number; today: string; recentFirst?: boolean }): Promise<PlanRow[]> {
  const plans = await db
    .select({ plan: productionPlans, name: products.name, variant: products.variant })
    .from(productionPlans)
    .innerJoin(products, eq(products.id, productionPlans.productId))
    .where(opts.status ? inArray(productionPlans.status, opts.status) : undefined)
    .orderBy(...(opts.recentFirst ? [desc(productionPlans.closedAt), desc(productionPlans.createdAt)] : [asc(productionPlans.targetDate), asc(productionPlans.number)]))
    .limit(opts.limit ?? 200);
  if (!plans.length) return [];

  const [progress, recipes] = await Promise.all([
    db
      .select({
        planId: productionEntries.planId,
        made: sql<number>`coalesce(sum(${productionEntries.qty}),0)::int`,
        accepted: sql<number>`coalesce(sum(${productionEntries.acceptedQty}),0)::int`,
        rejected: sql<number>`coalesce(sum(${productionEntries.rejectedQty}),0)::int`,
      })
      .from(productionEntries)
      .where(and(isNull(productionEntries.voidedAt), inArray(productionEntries.planId, plans.map((p) => p.plan.id))))
      .groupBy(productionEntries.planId),
    activeRecipes([...new Set(plans.map((p) => p.plan.productId))]),
  ]);

  return plans.map(({ plan, name, variant }) => {
    const p = progress.find((r) => r.planId === plan.id);
    const made = p?.made ?? 0;
    const accepted = p?.accepted ?? 0;
    const rejected = p?.rejected ?? 0;
    const remaining = Math.max(0, plan.qty - (made - rejected));
    const recipe = recipes.get(plan.productId) ?? null;
    const requirement = recipe ? materialRequirement(recipe.lines, remaining) : [];
    return {
      plan,
      name,
      variant,
      made,
      accepted,
      rejected,
      awaitingQc: made - accepted - rejected,
      remaining,
      recipe,
      requirement,
      shortCount: requirement.filter((r) => r.short > 0).length,
      remainingCostP: requirementCostP(requirement),
      overdue: plan.status === "open" && remaining > 0 && plan.targetDate < opts.today,
    };
  });
}

export type PlanOption = { id: string; number: string; productId: string; label: string; remaining: number; targetDate: string };

/** Open plans with pieces left to make, for the production dialog. */
export function toPlanOptions(rows: PlanRow[]): PlanOption[] {
  return rows
    .filter((r) => r.plan.status === "open" && r.remaining > 0)
    .map((r) => ({ id: r.plan.id, number: r.plan.number, productId: r.plan.productId, label: `${r.plan.number} · ${r.name}${r.variant ? ` — ${r.variant}` : ""}`, remaining: r.remaining, targetDate: r.plan.targetDate }));
}

export async function planOptions(today: string): Promise<PlanOption[]> {
  return toPlanOptions(await planRows({ status: ["open"], today }));
}
