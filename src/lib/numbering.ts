import { and, eq, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db";
import { entities, invoices, creditNotes, numberCounters } from "@/db/schema";
import { financialYear } from "@/lib/dates";
import { formatInvoiceNumber } from "@/lib/invoice";

export const SERIES = {
  sale: { prefix: "INV", digits: 5, label: "Sales" },
  expense: { prefix: "EXP", digits: 5, label: "Expenses" },
  return: { prefix: "CN", digits: 5, label: "Returns / credit notes" },
  purchase: { prefix: "PUR", digits: 5, label: "Purchases" },
  production: { prefix: "PROD", digits: 5, label: "Production" },
  jobwork: { prefix: "JW", digits: 5, label: "Job work orders" },
  dispatch: { prefix: "DSP", digits: 5, label: "Dispatch challans" },
  receipt: { prefix: "RCPT", digits: 5, label: "Payments received" },
  payment: { prefix: "PAY", digits: 5, label: "Payments made" },
} as const;
export type SeriesKey = keyof typeof SERIES;

/** Atomically allocate the next document number, e.g. INV/26-27/00012 (resets each financial year). */
export async function nextNumber(dbOrTx: Db | Tx, series: SeriesKey, dateStr: string): Promise<string> {
  const { prefix, digits } = SERIES[series];
  const periodKey = financialYear(dateStr);
  const [row] = await dbOrTx
    .insert(numberCounters)
    .values({ seriesKey: series, periodKey, next: 2 })
    .onConflictDoUpdate({
      target: [numberCounters.seriesKey, numberCounters.periodKey],
      set: { next: sql`${numberCounters.next} + 1` },
    })
    .returning({ next: numberCounters.next });
  const n = row.next - 1;
  return `${prefix}/${periodKey}/${String(n).padStart(digits, "0")}`;
}

/* Books with the same GSTIN share the invoice series. */
async function invoiceSeries(dbOrTx: Db | Tx, entityId: string, prefix: string) {
  if (!/^[A-Z0-9-]{1,6}$/.test(prefix)) throw new Error("Use an invoice prefix of 1 to 6 letters, digits or hyphens");
  const [seller] = await dbOrTx.select({ gstin: entities.gstin }).from(entities).where(eq(entities.id, entityId));
  if (!seller?.gstin) throw new Error("Add the seller GSTIN in Company details first");
  return { key: `invoice:${seller.gstin.toUpperCase()}:${prefix}`, gstin: seller.gstin.toUpperCase() };
}

export async function nextInvoiceNumber(dbOrTx: Db | Tx, entityId: string, prefix: string, dateStr: string): Promise<string> {
  const { key } = await invoiceSeries(dbOrTx, entityId, prefix);
  const periodKey = financialYear(dateStr);
  const [row] = await dbOrTx.update(numberCounters).set({ next: sql`${numberCounters.next} + 1` })
    .where(and(eq(numberCounters.seriesKey, key), eq(numberCounters.periodKey, periodKey))).returning({ next: numberCounters.next });
  if (!row) throw new Error(`Confirm the next ${prefix} invoice number for ${periodKey} in Settings → Company details before issuing invoices.`);
  const number = formatInvoiceNumber(prefix, row.next - 1, periodKey);
  if (number.length > 16) throw new Error("Invoice number exceeds 16 characters. Choose a shorter prefix.");
  return number;
}

export async function peekInvoiceNumber(dbOrTx: Db | Tx, entityId: string, prefix: string, dateStr: string): Promise<number | null> {
  const [seller] = await dbOrTx.select({ gstin: entities.gstin }).from(entities).where(eq(entities.id, entityId));
  if (!seller?.gstin) return null;
  const { key } = await invoiceSeries(dbOrTx, entityId, prefix);
  const [row] = await dbOrTx.select({ next: numberCounters.next }).from(numberCounters)
    .where(and(eq(numberCounters.seriesKey, key), eq(numberCounters.periodKey, financialYear(dateStr))));
  return row?.next ?? null;
}

/** Counters can advance, but neither used nor cancelled numbers can be reused. */
export async function setNextInvoiceNumber(dbOrTx: Db | Tx, entityId: string, prefix: string, dateStr: string, next: number) {
  const { key, gstin } = await invoiceSeries(dbOrTx, entityId, prefix);
  const periodKey = financialYear(dateStr);
  if (!Number.isSafeInteger(next) || next < 1 || formatInvoiceNumber(prefix, next, periodKey).length > 16) throw new Error("Enter a valid next invoice number (maximum 16 characters including the prefix and year)");
  const [row] = await dbOrTx.insert(numberCounters).values({ seriesKey: key, periodKey, next })
    .onConflictDoUpdate({ target: [numberCounters.seriesKey, numberCounters.periodKey], set: { next }, setWhere: sql`${numberCounters.next} <= ${next}` }).returning();
  if (!row) throw new Error("The next invoice number cannot move backwards. Refresh Settings to see the current number.");
  const [used] = await dbOrTx.select({ id: invoices.id }).from(invoices)
    .where(and(eq(invoices.sellerGstin, gstin), eq(invoices.number, formatInvoiceNumber(prefix, next, periodKey))));
  const [usedCredit] = await dbOrTx.select({ id: creditNotes.id }).from(creditNotes).where(and(eq(creditNotes.sellerGstin, gstin), eq(creditNotes.number, formatInvoiceNumber(prefix, next, periodKey))));
  if (used || usedCredit) throw new Error("That invoice number has already been used, including cancelled invoices");
}
