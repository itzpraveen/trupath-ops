/** Indian states and union territories: GST state code, name, and the ISO 3166-2 code Shopify uses. */
export const STATES: Array<{ code: string; name: string; iso: string }> = [
  { code: "01", name: "Jammu & Kashmir", iso: "JK" },
  { code: "02", name: "Himachal Pradesh", iso: "HP" },
  { code: "03", name: "Punjab", iso: "PB" },
  { code: "04", name: "Chandigarh", iso: "CH" },
  { code: "05", name: "Uttarakhand", iso: "UK" },
  { code: "06", name: "Haryana", iso: "HR" },
  { code: "07", name: "Delhi", iso: "DL" },
  { code: "08", name: "Rajasthan", iso: "RJ" },
  { code: "09", name: "Uttar Pradesh", iso: "UP" },
  { code: "10", name: "Bihar", iso: "BR" },
  { code: "11", name: "Sikkim", iso: "SK" },
  { code: "12", name: "Arunachal Pradesh", iso: "AR" },
  { code: "13", name: "Nagaland", iso: "NL" },
  { code: "14", name: "Manipur", iso: "MN" },
  { code: "15", name: "Mizoram", iso: "MZ" },
  { code: "16", name: "Tripura", iso: "TR" },
  { code: "17", name: "Meghalaya", iso: "ML" },
  { code: "18", name: "Assam", iso: "AS" },
  { code: "19", name: "West Bengal", iso: "WB" },
  { code: "20", name: "Jharkhand", iso: "JH" },
  { code: "21", name: "Odisha", iso: "OR" },
  { code: "22", name: "Chhattisgarh", iso: "CT" },
  { code: "23", name: "Madhya Pradesh", iso: "MP" },
  { code: "24", name: "Gujarat", iso: "GJ" },
  { code: "26", name: "Dadra & Nagar Haveli and Daman & Diu", iso: "DH" },
  { code: "27", name: "Maharashtra", iso: "MH" },
  { code: "29", name: "Karnataka", iso: "KA" },
  { code: "30", name: "Goa", iso: "GA" },
  { code: "31", name: "Lakshadweep", iso: "LD" },
  { code: "32", name: "Kerala", iso: "KL" },
  { code: "33", name: "Tamil Nadu", iso: "TN" },
  { code: "34", name: "Puducherry", iso: "PY" },
  { code: "35", name: "Andaman & Nicobar Islands", iso: "AN" },
  { code: "36", name: "Telangana", iso: "TG" },
  { code: "37", name: "Andhra Pradesh", iso: "AP" },
  { code: "38", name: "Ladakh", iso: "LA" },
];

const ALIASES: Record<string, string> = { DD: "26", DN: "26", TS: "36", UT: "05", OD: "21", CG: "22" };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** GST state code from Shopify's province code ("TN") or province name ("Tamil Nadu"). */
export function stateCodeFor(input: { provinceCode?: string | null; province?: string | null }): string | null {
  const iso = input.provinceCode?.trim().toUpperCase();
  if (iso) {
    const hit = STATES.find((s) => s.iso === iso) ?? (ALIASES[iso] ? STATES.find((s) => s.code === ALIASES[iso]) : undefined);
    if (hit) return hit.code;
    if (/^\d{2}$/.test(iso) && STATES.some((s) => s.code === iso)) return iso;
  }
  const name = input.province ? norm(input.province) : "";
  if (name) {
    const hit = STATES.find((s) => norm(s.name) === name || norm(s.name).replace(/and/g, "") === name.replace(/and/g, ""));
    if (hit) return hit.code;
    if (name === "orissa") return "21";
    if (name === "pondicherry") return "34";
  }
  return null;
}

export function stateName(code: string | null | undefined): string {
  if (!code) return "";
  return STATES.find((s) => s.code === code.padStart(2, "0"))?.name ?? "";
}
