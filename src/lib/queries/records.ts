import "server-only";
import { and, count, desc, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { businessRecords, contacts, users, type RecordKind } from "@/db/schema";

export type RecordFilters = {
  brand?: string;
  entity?: string; // brand | factory | all
  kind?: string; // sale | expense | return | purchase | all
  from?: string;
  to?: string;
  q?: string;
  channel?: string;
  includeVoided?: boolean;
  page?: number;
  pageSize?: number;
};

function whereFor(f: RecordFilters) {
  const conds = [];
  if (f.brand === "unassigned") conds.push(isNull(businessRecords.brandId));
  else if (f.brand && f.brand !== "all") conds.push(eq(businessRecords.brandId, f.brand));
  if (f.entity && f.entity !== "all") conds.push(eq(businessRecords.entityId, f.entity));
  if (f.kind && f.kind !== "all") conds.push(eq(businessRecords.kind, f.kind as RecordKind));
  if (f.from) conds.push(gte(businessRecords.workDate, f.from));
  if (f.to) conds.push(lte(businessRecords.workDate, f.to));
  if (f.channel) conds.push(eq(businessRecords.channel, f.channel));
  if (!f.includeVoided) conds.push(isNull(businessRecords.voidedAt));
  if (f.q) {
    const like = `%${f.q}%`;
    conds.push(or(ilike(businessRecords.reference, like), ilike(businessRecords.note, like), ilike(businessRecords.number, like), ilike(businessRecords.category, like), ilike(contacts.name, like)));
  }
  return conds.length ? and(...conds) : undefined;
}

export async function listRecords(f: RecordFilters) {
  const pageSize = f.pageSize ?? 50;
  const page = Math.max(1, f.page ?? 1);
  const where = whereFor(f);
  const rows = await db
    .select({
      record: businessRecords,
      contactName: contacts.name,
      userName: users.name,
    })
    .from(businessRecords)
    .leftJoin(contacts, eq(contacts.id, businessRecords.contactId))
    .leftJoin(users, eq(users.id, businessRecords.userId))
    .where(where)
    .orderBy(desc(businessRecords.workDate), desc(businessRecords.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [{ total }] = await db.select({ total: count() }).from(businessRecords).leftJoin(contacts, eq(contacts.id, businessRecords.contactId)).where(where);
  return { rows, total: Number(total), page, pageSize };
}

export type MoneyTotals = Record<RecordKind, { total: number; count: number }>;

export async function totalsByKind(f: Pick<RecordFilters, "entity" | "brand" | "from" | "to" | "channel">): Promise<MoneyTotals> {
  const rows = await db
    .select({ kind: businessRecords.kind, total: sql<number>`coalesce(sum(${businessRecords.amountP}), 0)::float8`, n: sql<number>`count(*)::int` })
    .from(businessRecords)
    .leftJoin(contacts, eq(contacts.id, businessRecords.contactId))
    .where(whereFor({ ...f, includeVoided: false }))
    .groupBy(businessRecords.kind);
  const out: MoneyTotals = { sale: { total: 0, count: 0 }, expense: { total: 0, count: 0 }, return: { total: 0, count: 0 }, purchase: { total: 0, count: 0 } };
  for (const r of rows) out[r.kind] = { total: Number(r.total), count: Number(r.n) };
  return out;
}

export function netOf(t: MoneyTotals) {
  return t.sale.total - t.return.total - t.expense.total - t.purchase.total;
}
