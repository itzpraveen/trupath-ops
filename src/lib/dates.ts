import { addDays as dfAddDays, format, parseISO, isValid } from "date-fns";

export const IST = "Asia/Kolkata";

const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" });

/** Today's date in India as YYYY-MM-DD (server may run in UTC). */
export function todayIST(): string {
  return ymd.format(new Date());
}

export function toYmd(d: Date): string {
  return ymd.format(d);
}

export function addDays(dateStr: string, n: number): string {
  return format(dfAddDays(parseISO(dateStr), n), "yyyy-MM-dd");
}

export function monthKey(dateStr = todayIST()): string {
  return dateStr.slice(0, 7);
}

/** [first day, last day] of a YYYY-MM month. */
export function monthRange(ym: string): [string, string] {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${ym}-01`, `${ym}-${String(last).padStart(2, "0")}`];
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Indian financial year label for a date: 2026-09-07 -> "26-27". */
export function financialYear(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

export function fyRange(dateStr = todayIST()): [string, string] {
  const [y, m] = dateStr.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return [`${start}-04-01`, `${start + 1}-03-31`];
}

export function formatDate(d: string | Date | null | undefined, fmt = "dd MMM yyyy"): string {
  if (!d) return "—";
  const date = typeof d === "string" ? parseISO(d) : d;
  return isValid(date) ? format(date, fmt) : "—";
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function monthLabel(ym: string): string {
  return format(parseISO(`${ym}-01`), "MMMM yyyy");
}

export function isYmd(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && isValid(parseISO(s));
}
