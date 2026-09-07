import "server-only";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { businessRecords, materials, products, shopifyOrders } from "@/db/schema";
import { shiftMonth, monthKey } from "@/lib/dates";

export async function monthlyTrend(entity: string, months = 12) {
  const end = monthKey();
  const start = shiftMonth(end, -(months - 1));
  const rows = await db
    .select({ ym: sql<string>`to_char(${businessRecords.workDate}, 'YYYY-MM')`, kind: businessRecords.kind, total: sql<number>`coalesce(sum(${businessRecords.amountP}),0)::float8` })
    .from(businessRecords)
    .where(and(isNull(businessRecords.voidedAt), gte(businessRecords.workDate, `${start}-01`), entity === "all" ? undefined : eq(businessRecords.entityId, entity)))
    .groupBy(sql`to_char(${businessRecords.workDate}, 'YYYY-MM')`, businessRecords.kind);
  const out: { ym: string; sales: number; returns: number; expenses: number; purchases: number; net: number }[] = [];
  for (let i = 0; i < months; i++) {
    const ym = shiftMonth(start, i);
    const e = { ym, sales: 0, returns: 0, expenses: 0, purchases: 0, net: 0 };
    for (const r of rows) {
      if (r.ym !== ym) continue;
      if (r.kind === "sale") e.sales += Number(r.total);
      else if (r.kind === "return") e.returns += Number(r.total);
      else if (r.kind === "expense") e.expenses += Number(r.total);
      else e.purchases += Number(r.total);
    }
    e.net = e.sales - e.returns - e.expenses - e.purchases;
    out.push(e);
  }
  return out;
}

export async function gstSummary(entity: string, from: string, to: string) {
  const [input] = await db
    .select({ gst: sql<number>`coalesce(sum(${businessRecords.gstP}),0)::float8`, taxable: sql<number>`coalesce(sum(${businessRecords.taxableP}),0)::float8`, bills: sql<number>`count(*) filter (where ${businessRecords.gstP} > 0)::int` })
    .from(businessRecords)
    .where(and(isNull(businessRecords.voidedAt), sql`${businessRecords.kind} in ('expense','purchase')`, gte(businessRecords.workDate, from), lte(businessRecords.workDate, to), entity === "all" ? undefined : eq(businessRecords.entityId, entity)));
  const [web] =
    entity === "factory"
      ? [{ tax: 0, orders: 0, total: 0 }]
      : await db
          .select({ tax: sql<number>`coalesce(sum(${shopifyOrders.taxP}),0)::float8`, orders: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${shopifyOrders.totalP}),0)::float8` })
          .from(shopifyOrders)
          .where(and(isNull(shopifyOrders.cancelledAt), sql`(${shopifyOrders.createdAtShop} at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date`));
  return { inputGst: Number(input?.gst ?? 0), inputTaxable: Number(input?.taxable ?? 0), inputBills: Number(input?.bills ?? 0), websiteTax: Number(web?.tax ?? 0), websiteOrders: Number(web?.orders ?? 0), websiteTotal: Number(web?.total ?? 0) };
}

export async function stockValuation() {
  const [fg] = await db
    .select({ units: sql<number>`coalesce(sum(${products.stockQty}),0)::int`, value: sql<number>`coalesce(sum(${products.stockQty} * ${products.costP}),0)::float8`, retail: sql<number>`coalesce(sum(${products.stockQty} * ${products.priceP}),0)::float8` })
    .from(products)
    .where(eq(products.active, true));
  const [rm] = await db.select({ value: sql<number>`coalesce(sum(${materials.qty} * ${materials.costP}),0)::float8`, items: sql<number>`count(*)::int` }).from(materials).where(eq(materials.active, true));
  return { fgUnits: Number(fg?.units ?? 0), fgValue: Number(fg?.value ?? 0), fgRetail: Number(fg?.retail ?? 0), rmValue: Number(rm?.value ?? 0), rmItems: Number(rm?.items ?? 0) };
}

export async function topWebsiteProducts(from: string, to: string, limit = 10) {
  const res = await db.execute(sql`
    select li->>'title' as title, sum((li->>'quantity')::int)::int as qty, sum(((li->>'quantity')::int) * (li->>'priceP')::bigint)::float8 as value
    from ${shopifyOrders}, jsonb_array_elements(${shopifyOrders.lineItems}) li
    where ${shopifyOrders.cancelledAt} is null
      and (${shopifyOrders.createdAtShop} at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date
    group by 1 order by 2 desc limit ${limit}
  `);
  return (res as unknown as { title: string; qty: number; value: number }[]).map((r) => ({ title: String(r.title), qty: Number(r.qty), value: Number(r.value) }));
}
