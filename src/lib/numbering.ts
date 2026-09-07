import { sql } from "drizzle-orm";
import type { Db, Tx } from "@/db";
import { numberCounters } from "@/db/schema";
import { financialYear } from "@/lib/dates";

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
