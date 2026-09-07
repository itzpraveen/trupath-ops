/** Build a query string from params, dropping empty values. */
export function qs(params: Record<string, string | number | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function pick<const T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T[number]) : fallback;
}

export function str(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function int(value: unknown, fallback = 1, min = 1): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
}
