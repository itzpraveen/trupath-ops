import type { CreditNoteLine, Invoice } from "@/db/schema";

export type ReturnSelection = { originalLine: number; qty: number; restockQty: number };
export type CreditTotals = { lines: CreditNoteLine[]; taxableP: number; cgstP: number; sgstP: number; igstP: number; roundOffP: number; totalP: number };

/** Allocate each return against the original amounts, retaining the final paise on the last return. */
export function computeCreditNote(invoice: Pick<Invoice, "lines" | "cgstP" | "sgstP" | "igstP" | "roundOffP" | "totalP">, previous: CreditTotals[], selections: ReturnSelection[]): CreditTotals {
  const seen = new Set<number>();
  const lines = selections.map((s) => {
    const l = invoice.lines[s.originalLine];
    if (!Number.isInteger(s.originalLine) || !l || seen.has(s.originalLine)) throw new Error("Choose each original invoice item only once");
    seen.add(s.originalLine);
    const returned = previous.flatMap(p => p.lines).filter(p => p.originalLine === s.originalLine).reduce((n,p) => n+p.qty,0);
    if (!Number.isSafeInteger(s.qty) || s.qty <= 0 || s.qty > l.qty-returned || !Number.isSafeInteger(s.restockQty) || s.restockQty < 0 || s.restockQty > s.qty) throw new Error(`Check returned and saleable quantities for ${l.description}; ${l.qty-returned} remain`);
    const portion = (total: number) => Math.round(total*(returned+s.qty)/l.qty)-Math.round(total*returned/l.qty);
    const inclP = portion(l.inclP), taxP = portion(l.taxP), taxableP = inclP-taxP;
    return { ...l, originalLine: s.originalLine, qty: s.qty, restockQty: s.restockQty, inclP, taxP, taxableP, unitInclP: Math.round(inclP/s.qty), unitExclP: Math.round(taxableP/s.qty) };
  });
  if (!lines.length) throw new Error("Enter at least one returned quantity");
  const fullyReturned = invoice.lines.every((l,i) => [...previous.flatMap(p=>p.lines), ...lines].filter(p=>p.originalLine===i).reduce((n,p)=>n+p.qty,0) === l.qty);
  const taxP = lines.reduce((n,l)=>n+l.taxP,0), taxableP=lines.reduce((n,l)=>n+l.taxableP,0);
  const oldTax = previous.reduce((n,p)=>n+p.cgstP+p.sgstP+p.igstP,0);
  const originalTax = invoice.cgstP+invoice.sgstP+invoice.igstP;
  const cgstP = originalTax ? Math.round(invoice.cgstP*(oldTax+taxP)/originalTax)-previous.reduce((n,p)=>n+p.cgstP,0) : 0;
  const sgstP = invoice.igstP ? 0 : taxP-cgstP, igstP = invoice.igstP ? taxP : 0;
  const roundOffP = fullyReturned ? invoice.roundOffP-previous.reduce((n,p)=>n+p.roundOffP,0) : 0;
  const totalP = taxableP+taxP+roundOffP;
  if (totalP<=0 || totalP+previous.reduce((n,p)=>n+p.totalP,0)>invoice.totalP) throw new Error("Credit exceeds the original invoice value or has no value");
  return { lines, taxableP, cgstP, sgstP, igstP, roundOffP, totalP };
}
