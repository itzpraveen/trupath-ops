/**
 * GST tax invoice arithmetic. Pure and unit-tested; the server module builds the inputs and stores the result.
 * Money is integer paise. Prices on the website and in the catalogue include tax, as on the Tally invoices
 * the business issues today, so tax is worked back out of the inclusive amount.
 */
export type InvoiceLineInput = {
  productId?: string;
  description: string;
  hsn: string;
  ratePct: number;
  qty: number;
  unit: string;
  /** Line total including tax (after any discount). */
  inclP: number;
  /** Tax exactly as charged by the source (Shopify tax lines); worked out from the rate when absent. */
  taxP?: number;
};

export type InvoiceLine = InvoiceLineInput & {
  taxP: number;
  taxableP: number;
  /** Per-unit price including and excluding tax, for the "Rate (Incl. of Tax)" and "Rate" columns. */
  unitInclP: number;
  unitExclP: number;
};

export type InvoiceTotals = {
  lines: InvoiceLine[];
  intraState: boolean;
  taxableP: number;
  taxP: number;
  cgstP: number;
  sgstP: number;
  igstP: number;
  roundOffP: number;
  totalP: number;
};

/** Split a tax-inclusive amount into taxable value and tax at the given GST rate. */
export function splitInclusive(inclP: number, ratePct: number): { taxableP: number; taxP: number } {
  const taxableP = Math.round(inclP / (1 + ratePct / 100));
  return { taxableP, taxP: inclP - taxableP };
}

/**
 * Work out every line and the tax split. `totalP` is what the customer actually paid; any paise left over after
 * the lines may only be a small rounding adjustment. Discounts must already be allocated to the lines.
 */
export function computeInvoice(input: { sellerStateCode: string; buyerStateCode: string; lines: InvoiceLineInput[]; totalP?: number }): InvoiceTotals {
  if (!/^\d{2}$/.test(input.sellerStateCode) || !/^\d{2}$/.test(input.buyerStateCode)) throw new Error("Seller and buyer state codes are required");
  if (!input.lines.length) throw new Error("Add at least one invoice item");
  for (const l of input.lines) {
    if (!l.description.trim() || !/^\d{4,8}$/.test(l.hsn)) throw new Error(`Set a valid HSN / SAC for ${l.description || "every item"}`);
    if (!Number.isFinite(l.qty) || l.qty <= 0 || !Number.isFinite(l.ratePct) || l.ratePct < 0 || l.ratePct > 100) throw new Error("Check item quantities and GST rates");
    if (!Number.isSafeInteger(l.inclP) || l.inclP < 0 || (l.taxP !== undefined && (!Number.isSafeInteger(l.taxP) || l.taxP < 0 || l.taxP > l.inclP))) throw new Error("Check item amounts and tax");
    if (l.taxP !== undefined && Math.abs(l.taxP - splitInclusive(l.inclP, l.ratePct).taxP) > Math.max(2, Math.ceil(l.qty))) throw new Error(`The tax and selling value do not agree for ${l.description}. Refresh the order and check its discounts.`);
  }
  const intraState = input.sellerStateCode.padStart(2, "0") === input.buyerStateCode.padStart(2, "0");
  const lines: InvoiceLine[] = input.lines.map((l) => {
    const taxP = l.taxP !== undefined ? l.taxP : splitInclusive(l.inclP, l.ratePct).taxP;
    const taxableP = l.inclP - taxP;
    const qty = l.qty > 0 ? l.qty : 1;
    return { ...l, taxP, taxableP, unitInclP: Math.round(l.inclP / qty), unitExclP: Math.round(taxableP / qty) };
  });
  const taxableP = lines.reduce((s, l) => s + l.taxableP, 0);
  const taxP = lines.reduce((s, l) => s + l.taxP, 0);
  const linesTotal = taxableP + taxP;
  const totalP = input.totalP ?? linesTotal;
  if (!Number.isSafeInteger(totalP) || totalP <= 0 || Math.abs(totalP - linesTotal) > 100) throw new Error("The invoice items do not match the order total. Check discounts, shipping and quantities; this difference cannot be treated as round-off.");
  const cgstP = intraState ? Math.round(taxP / 2) : 0;
  const sgstP = intraState ? taxP - cgstP : 0;
  const igstP = intraState ? 0 : taxP;
  return { lines, intraState, taxableP, taxP, cgstP, sgstP, igstP, roundOffP: totalP - linesTotal, totalP };
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(ONES[n % 10] ? `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}` : TENS[Math.floor(n / 10)]);
  } else if (n > 0) parts.push(ONES[n]);
  return parts.join(" ");
}

/** Whole-number words in the Indian system: crore, lakh, thousand. */
export function numberToWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${numberToWords(crore)} Crore`);
  if (lakh) parts.push(`${belowThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${belowThousand(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(" ");
}

/** "INR One Thousand Nine Hundred Ninety Nine Only", as Tally prints it. */
export function amountInWords(paise: number): string {
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const words = p ? `${numberToWords(rupees)} and ${numberToWords(p)} Paise` : numberToWords(rupees);
  return `INR ${words} Only`;
}

/** Tally-style number: B2C/611/26-27 (no zero padding). */
export function formatInvoiceNumber(prefix: string, n: number, fy: string): string {
  return `${prefix}/${n}/${fy}`;
}
