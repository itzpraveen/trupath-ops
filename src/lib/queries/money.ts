import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, businessRecords, contacts, payments } from "@/db/schema";

/** Outstanding per contact: credit sales minus receipts (customers) or credit bills minus payments (vendors). */
export async function outstandingByContact(entity = "all") {
  const credit = await db
    .select({ entityId: businessRecords.entityId, contactId: businessRecords.contactId, kind: businessRecords.kind, total: sql<number>`coalesce(sum(${businessRecords.amountP}),0)::float8` })
    .from(businessRecords)
    .where(and(isNull(businessRecords.voidedAt), eq(businessRecords.paymentTerms, "credit"), sql`${businessRecords.contactId} is not null`, entity === "all" ? undefined : eq(businessRecords.entityId, entity)))
    .groupBy(businessRecords.entityId, businessRecords.contactId, businessRecords.kind);
  const paid = await db
    .select({ entityId: payments.entityId, contactId: payments.contactId, direction: payments.direction, contactType: contacts.type, total: sql<number>`coalesce(sum(${payments.amountP}),0)::float8` })
    .from(payments)
    .leftJoin(contacts, eq(contacts.id, payments.contactId))
    .where(and(isNull(payments.voidedAt), sql`${payments.contactId} is not null`, entity === "all" ? undefined : eq(payments.entityId, entity)))
    .groupBy(payments.entityId, payments.contactId, payments.direction, contacts.type);
  const map = new Map<string, { entityId: string; contactId: string; receivable: number; payable: number }>();
  const get = (entityId: string, contactId: string) => { const id = `${entityId}:${contactId}`; return map.get(id) ?? (map.set(id, { entityId, contactId, receivable: 0, payable: 0 }), map.get(id)!); };
  for (const r of credit) {
    if (!r.contactId) continue;
    const e = get(r.entityId, r.contactId);
    if (r.kind === "sale") e.receivable += Number(r.total);
    else if (r.kind === "return") e.receivable -= Number(r.total);
    else e.payable += Number(r.total);
  }
  for (const p of paid) {
    if (!p.contactId) continue;
    const e = get(p.entityId, p.contactId);
    if (p.direction === "in") e.receivable -= Number(p.total);
    else if (p.contactType === "customer") e.receivable += Number(p.total);
    else e.payable -= Number(p.total);
  }
  for (const balance of map.values()) if (balance.receivable < 0) { balance.payable += -balance.receivable; balance.receivable = 0; }
  return map;
}

export async function outstandingLists(entity = "all") {
  const map = await outstandingByContact(entity);
  const rows = await db.select({ id: contacts.id, name: contacts.name, type: contacts.type, phone: contacts.phone }).from(contacts);
  const entries = [...map.values()].flatMap((balance) => { const contact = rows.find((c) => c.id === balance.contactId); return contact ? [{ ...contact, ...balance }] : []; });
  const receivables = entries.map((c) => ({ ...c, amount: c.receivable })).filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
  const payables = entries.map((c) => ({ ...c, amount: c.payable })).filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
  return { receivables, payables };
}

/** Balance per cash/bank account: opening + paid ledger entries tagged to it + receipts − payments. */
export async function accountBalances(entity = "all") {
  const accounts = await db.select().from(bankAccounts).where(entity === "all" ? undefined : eq(bankAccounts.entityId, entity)).orderBy(bankAccounts.entityId, bankAccounts.name);
  const recs = await db
    .select({ bankAccountId: businessRecords.bankAccountId, kind: businessRecords.kind, total: sql<number>`coalesce(sum(${businessRecords.amountP}),0)::float8` })
    .from(businessRecords)
    .where(and(isNull(businessRecords.voidedAt), eq(businessRecords.paymentTerms, "paid"), sql`${businessRecords.bankAccountId} is not null`))
    .groupBy(businessRecords.bankAccountId, businessRecords.kind);
  const pays = await db
    .select({ bankAccountId: payments.bankAccountId, direction: payments.direction, total: sql<number>`coalesce(sum(${payments.amountP}),0)::float8` })
    .from(payments)
    .where(and(isNull(payments.voidedAt), sql`${payments.bankAccountId} is not null`))
    .groupBy(payments.bankAccountId, payments.direction);
  return accounts.map((a) => {
    let bal = a.openingP;
    for (const r of recs) if (r.bankAccountId === a.id) bal += r.kind === "sale" ? Number(r.total) : -Number(r.total);
    for (const p of pays) if (p.bankAccountId === a.id) bal += p.direction === "in" ? Number(p.total) : -Number(p.total);
    return { ...a, balanceP: Math.round(bal) };
  });
}
