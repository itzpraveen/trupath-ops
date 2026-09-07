import "server-only";
import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { attendance, businessRecords, dispatches, employees, materials, productionEntries, products, shopifyOrders, users, type AttendanceStatus } from "@/db/schema";
import { addDays } from "@/lib/dates";

const entityCond = (entity: string) => (entity === "all" ? undefined : eq(businessRecords.entityId, entity));

export async function dailySeries(entity: string, from: string, to: string) {
  const rows = await db
    .select({ date: businessRecords.workDate, kind: businessRecords.kind, total: sql<number>`coalesce(sum(${businessRecords.amountP}),0)::float8` })
    .from(businessRecords)
    .where(and(isNull(businessRecords.voidedAt), gte(businessRecords.workDate, from), lte(businessRecords.workDate, to), entityCond(entity)))
    .groupBy(businessRecords.workDate, businessRecords.kind);
  const map = new Map<string, { date: string; sales: number; expenses: number; returns: number }>();
  for (let d = from; d <= to; d = addDays(d, 1)) map.set(d, { date: d, sales: 0, expenses: 0, returns: 0 });
  for (const r of rows) {
    const e = map.get(r.date);
    if (!e) continue;
    if (r.kind === "sale") e.sales += Number(r.total);
    else if (r.kind === "return") e.returns += Number(r.total);
    else e.expenses += Number(r.total);
  }
  return [...map.values()];
}

export async function channelSplit(entity: string, from: string, to: string) {
  return db
    .select({ channel: businessRecords.channel, total: sql<number>`coalesce(sum(${businessRecords.amountP}),0)::float8`, n: sql<number>`count(*)::int` })
    .from(businessRecords)
    .where(and(isNull(businessRecords.voidedAt), eq(businessRecords.kind, "sale"), gte(businessRecords.workDate, from), lte(businessRecords.workDate, to), entityCond(entity)))
    .groupBy(businessRecords.channel)
    .orderBy(desc(sql`sum(${businessRecords.amountP})`));
}

export async function expenseByCategory(entity: string, from: string, to: string) {
  return db
    .select({ category: businessRecords.category, kind: businessRecords.kind, total: sql<number>`coalesce(sum(${businessRecords.amountP}),0)::float8`, n: sql<number>`count(*)::int` })
    .from(businessRecords)
    .where(and(isNull(businessRecords.voidedAt), sql`${businessRecords.kind} in ('expense','purchase')`, gte(businessRecords.workDate, from), lte(businessRecords.workDate, to), entityCond(entity)))
    .groupBy(businessRecords.category, businessRecords.kind)
    .orderBy(desc(sql`sum(${businessRecords.amountP})`));
}

export async function factoryOnDate(date: string) {
  const rows = await db
    .select({
      productId: productionEntries.productId,
      name: products.name,
      variant: products.variant,
      brandId: productionEntries.brandId,
      units: sql<number>`coalesce(sum(${productionEntries.qty}),0)::int`,
      entries: sql<number>`count(*)::int`,
    })
    .from(productionEntries)
    .innerJoin(products, eq(products.id, productionEntries.productId))
    .where(and(eq(productionEntries.workDate, date), isNull(productionEntries.voidedAt)))
    .groupBy(productionEntries.productId, products.name, products.variant, productionEntries.brandId)
    .orderBy(desc(sql`sum(${productionEntries.qty})`));
  const units = rows.reduce((s, r) => s + Number(r.units), 0);
  return { units, entries: rows.reduce((s, r) => s + Number(r.entries), 0), byProduct: rows };
}

export async function productionInRange(from: string, to: string) {
  const [row] = await db
    .select({ units: sql<number>`coalesce(sum(${productionEntries.qty}),0)::int`, entries: sql<number>`count(*)::int` })
    .from(productionEntries)
    .where(and(gte(productionEntries.workDate, from), lte(productionEntries.workDate, to), isNull(productionEntries.voidedAt)));
  return { units: Number(row?.units ?? 0), entries: Number(row?.entries ?? 0) };
}

export async function lowStock(limit = 8) {
  return db
    .select({ id: products.id, name: products.name, variant: products.variant, brandId: products.brandId, stockQty: products.stockQty, minStock: products.minStock, sku: products.sku })
    .from(products)
    .where(and(eq(products.active, true), sql`${products.minStock} > 0`, sql`${products.stockQty} <= ${products.minStock}`))
    .orderBy(asc(sql`${products.stockQty} - ${products.minStock}`))
    .limit(limit);
}

export async function lowStockCount() {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(and(eq(products.active, true), sql`${products.minStock} > 0`, sql`${products.stockQty} <= ${products.minStock}`));
  return Number(r?.n ?? 0);
}

export async function lowMaterials(limit = 8) {
  return db
    .select({ id: materials.id, code: materials.code, name: materials.name, unit: materials.unit, qty: materials.qty, minQty: materials.minQty })
    .from(materials)
    .where(and(eq(materials.active, true), sql`${materials.minQty} > 0`, sql`${materials.qty} <= ${materials.minQty}`))
    .orderBy(asc(sql`${materials.qty} / nullif(${materials.minQty},0)`))
    .limit(limit);
}

export async function dispatchCounts() {
  const rows = await db.select({ status: dispatches.status, n: sql<number>`count(*)::int` }).from(dispatches).groupBy(dispatches.status);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}

export async function attendanceOnDate(date: string) {
  const rows = await db
    .select({ status: attendance.status, n: sql<number>`count(*)::int` })
    .from(attendance)
    .innerJoin(employees, eq(employees.id, attendance.employeeId))
    .where(and(eq(attendance.workDate, date), eq(employees.active, true)))
    .groupBy(attendance.status);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(employees).where(eq(employees.active, true));
  const out: Record<AttendanceStatus, number> = { present: 0, half_day: 0, absent: 0, leave: 0, holiday: 0 };
  for (const r of rows) out[r.status] = Number(r.n);
  const marked = Object.values(out).reduce((a, b) => a + b, 0);
  return { ...out, total: Number(total), unmarked: Number(total) - marked };
}

export async function recentRecords(limit = 8) {
  return db
    .select({ record: businessRecords, userName: users.name })
    .from(businessRecords)
    .leftJoin(users, eq(users.id, businessRecords.userId))
    .where(isNull(businessRecords.voidedAt))
    .orderBy(desc(businessRecords.createdAt))
    .limit(limit);
}

export async function ordersSummary(todayFrom: Date, monthFrom: string, monthTo: string) {
  const [today] = await db.select({ n: sql<number>`count(*)::int` }).from(shopifyOrders).where(and(gte(shopifyOrders.createdAtShop, todayFrom), isNull(shopifyOrders.cancelledAt)));
  const [open] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(shopifyOrders)
    .where(and(isNull(shopifyOrders.cancelledAt), sql`${shopifyOrders.fulfillmentStatus} not in ('FULFILLED','RESTOCKED')`));
  const [month] = await db
    .select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${shopifyOrders.totalP}),0)::float8` })
    .from(shopifyOrders)
    .where(and(isNull(shopifyOrders.cancelledAt), sql`(${shopifyOrders.createdAtShop} at time zone 'Asia/Kolkata')::date between ${monthFrom}::date and ${monthTo}::date`));
  const recent = await db.select().from(shopifyOrders).orderBy(desc(shopifyOrders.createdAtShop)).limit(5);
  return { today: Number(today?.n ?? 0), open: Number(open?.n ?? 0), monthCount: Number(month?.n ?? 0), monthTotal: Number(month?.total ?? 0), recent };
}
