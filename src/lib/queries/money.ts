import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, businessRecords, contacts, payments } from "@/db/schema";

/** Outstanding per contact: credit sales minus receipts (customers) or credit bills minus payments (vendors). */
export async function outstandingByContact() {
  const credit = await db
    .select({ contactId: businessRecords.contactId, kind: businessRecords.kind, total: sql<number>`coalesce(sum(${businessRecords.amountP}),0)::float8` })
    .from(businessRecords)
    .where(and(isNull(businessRecords.voidedAt), eq(businessRecords.paymentTerms, "credit"), sql`${businessRecords.contactId} is not null`))
    .groupBy(businessRecords.contactId, businessRecords.kind);
  const paid = await db
    .select({ contactId: payments.contactId, direction: payments.direction, total: sql<number>`coalesce(sum(${payments.amountP}),0)::float8` })
    .from(payments)
    .where(and(isNull(payments.voidedAt), sql`${payments.contactId} is not null`))
    .groupBy(payments.contactId, payments.direction);
  const map = new Map<string, { receivable: number; payable: number }>();
  const get = (id: string) => map.get(id) ?? (map.set(id, { receivable: 0, payable: 0 }), map.get(id)!);
  for (const r of credit) {
    if (!r.contactId) continue;
    const e = get(r.contactId);
    if (r.kind === "sale") e.receivable += Number(r.total);
    else if (r.kind === "return") e.receivable -= Number(r.total);
    else e.payable += Number(r.total);
  }
  for (const p of paid) {
    if (!p.contactId) continue;
    const e = get(p.contactId);
    if (p.direction === "in") e.receivable -= Number(p.total);
    else e.payable -= Number(p.total);
  }
  return map;
}

export async function outstandingLists() {
  const map = await outstandingByContact();
  const ids = [...map.keys()];
  if (!ids.length) return { receivables: [], payables: [] };
  const rows = await db.select({ id: contacts.id, name: contacts.name, type: contacts.type, phone: contacts.phone }).from(contacts).where(sql`${contacts.id} in ${ids}`);
  const receivables = rows.map((c) => ({ ...c, amount: map.get(c.id)!.receivable })).filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
  const payables = rows.map((c) => ({ ...c, amount: map.get(c.id)!.payable })).filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
  return { receivables, payables };
}

/** Balance per cash/bank account: opening + paid ledger entries tagged to it + receipts − payments. */
export async function accountBalances() {
  const accounts = await db.select().from(bankAccounts).orderBy(bankAccounts.entityId, bankAccounts.name);
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
