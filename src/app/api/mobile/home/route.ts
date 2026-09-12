import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { attendance, boms, productionEntries, products } from "@/db/schema";
import { todayIST } from "@/lib/dates";
import { canEdit } from "@/lib/permissions";
import { getEmployees, getProductOptions } from "@/lib/queries/common";
import { lowMaterials } from "@/lib/queries/dashboard";
import { planRows } from "@/lib/queries/factory";
import { mobileUser } from "../_lib";

/** Everything the phone app shows, in one call, so a single pull-to-refresh updates the whole screen. */
export async function GET() {
  const auth = await mobileUser("factory");
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const today = todayIST();

  const [staff, options, marks, entries, pending, low, recipes, plans] = await Promise.all([
    getEmployees(true),
    getProductOptions(),
    db.select().from(attendance).where(eq(attendance.workDate, today)),
    db
      .select({ id: productionEntries.id, number: productionEntries.number, qty: productionEntries.qty, accepted: productionEntries.acceptedQty, rejected: productionEntries.rejectedQty, name: products.name, variant: products.variant, worker: productionEntries.workerName })
      .from(productionEntries)
      .innerJoin(products, eq(products.id, productionEntries.productId))
      .where(and(eq(productionEntries.workDate, today), isNull(productionEntries.voidedAt)))
      .orderBy(asc(productionEntries.createdAt)),
    db
      .select({ id: productionEntries.id, number: productionEntries.number, workDate: productionEntries.workDate, qty: productionEntries.qty, accepted: productionEntries.acceptedQty, rejected: productionEntries.rejectedQty, revision: productionEntries.qcRevision, name: products.name, variant: products.variant })
      .from(productionEntries)
      .innerJoin(products, eq(products.id, productionEntries.productId))
      .where(and(isNull(productionEntries.voidedAt), eq(productionEntries.qcRequired, true), sql`${productionEntries.qty} > ${productionEntries.acceptedQty} + ${productionEntries.rejectedQty}`))
      .orderBy(asc(productionEntries.workDate))
      .limit(50),
    lowMaterials(20),
    db.select({ productId: boms.productId }).from(boms).where(eq(boms.active, true)),
    planRows({ status: ["open"], today }),
  ]);

  const label = (name: string, variant: string) => (variant ? `${name} — ${variant}` : name);
  const marked = new Map(marks.map((m) => [m.employeeId, m.status]));
  const withRecipe = new Set(recipes.map((r) => r.productId));

  return Response.json({
    ok: true,
    today,
    user: { id: user.id, name: user.name, role: user.role },
    can: { production: canEdit(user.role, "factory"), attendance: canEdit(user.role, "attendance") },
    plans: plans
      .filter((p) => p.remaining > 0)
      .map((p) => ({ id: p.plan.id, number: p.plan.number, productId: p.plan.productId, product: label(p.name, p.variant), remaining: p.remaining, targetDate: p.plan.targetDate, overdue: p.overdue, short: p.shortCount, hasRecipe: !!p.recipe })),
    products: options.map((p) => ({ id: p.id, label: label(p.name, p.variant), brand: p.brandId, recipe: withRecipe.has(p.id) })),
    staff: staff.map((s) => ({ id: s.id, name: s.name, code: s.code, job: s.designation, status: marked.get(s.id) ?? null })),
    madeToday: entries.map((e) => ({ id: e.id, number: e.number, product: label(e.name, e.variant), qty: e.qty, accepted: e.accepted, rejected: e.rejected, worker: e.worker })),
    awaitingQc: pending.map((e) => ({ id: e.id, number: e.number, workDate: e.workDate, product: label(e.name, e.variant), qty: e.qty, accepted: e.accepted, rejected: e.rejected, revision: e.revision, left: e.qty - e.accepted - e.rejected })),
    lowMaterials: low.map((m) => ({ id: m.id, name: m.name, qty: m.qty, unit: m.unit, minQty: m.minQty })),
  });
}
