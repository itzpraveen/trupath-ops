const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrExact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

/** Format integer paise as rupees. Whole rupees drop the decimals. */
export function formatINR(paise: number | null | undefined, opts?: { exact?: boolean }) {
  const p = paise ?? 0;
  if (opts?.exact || p % 100 !== 0) return inrExact.format(p / 100);
  return inr.format(p / 100);
}

/** Compact rupee display for KPI tiles: ₹1.2L, ₹3.4Cr */
export function formatINRCompact(paise: number | null | undefined) {
  const r = (paise ?? 0) / 100;
  const abs = Math.abs(r);
  const sign = r < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `${sign}₹${num.format(Math.round(abs))}`;
  return `${sign}₹${abs % 1 === 0 ? abs : abs.toFixed(2)}`;
}

export function formatQty(n: number | null | undefined, unit?: string) {
  const v = num.format(n ?? 0);
  return unit ? `${v} ${unit}` : v;
}

/** Parse a rupee amount typed by a human ("1,234.50", "₹ 999") into integer paise. */
export function toPaise(input: string | number): number {
  const n = typeof input === "number" ? input : Number(String(input).replace(/[₹,\s]/g, ""));
  if (!Number.isFinite(n)) throw new Error("Invalid amount");
  return Math.round(n * 100);
}

export function toRupees(paise: number | null | undefined): string {
  const p = paise ?? 0;
  return p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2);
}
