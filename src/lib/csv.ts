export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length) return columns ? columns.join(",") + "\n" : "";
  const cols = columns ?? Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

export function csvResponse(filename: string, body: string) {
  return new Response("﻿" + body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` },
  });
}
