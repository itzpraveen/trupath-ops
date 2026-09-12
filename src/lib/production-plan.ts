/**
 * Material requirement maths for production planning.
 *
 * Pure functions so the planner, the recipe list and the shortage reports all
 * answer "what does this cost and do we have it?" the same way `createProduction`
 * answers it when the materials actually leave the store.
 */

export const round3 = (n: number) => Math.round(n * 1000) / 1000;

export type RecipeLine = {
  materialId: string;
  name: string;
  unit: string;
  /** Material used for one finished piece, before wastage. */
  qtyPerUnit: number;
  wastagePct: number;
  /** Cost of one unit of the material, in paise. */
  costP: number;
  /** What the store holds right now. */
  inStock: number;
};

export type Requirement = {
  materialId: string;
  name: string;
  unit: string;
  /** Including wastage, for one piece. */
  perPiece: number;
  /** Including wastage, for the whole quantity. */
  required: number;
  inStock: number;
  /** How much has to be bought or received before this can be made. */
  short: number;
  unitCostP: number;
  costP: number;
};

const withWastage = (line: Pick<RecipeLine, "qtyPerUnit" | "wastagePct">, qty: number) => round3(line.qtyPerUnit * qty * (1 + line.wastagePct / 100));

/** What making `qty` pieces takes out of the store, line by line. */
export function materialRequirement(lines: RecipeLine[], qty: number): Requirement[] {
  return lines.map((line) => {
    const required = withWastage(line, qty);
    return {
      materialId: line.materialId,
      name: line.name,
      unit: line.unit,
      perPiece: withWastage(line, 1),
      required,
      inStock: line.inStock,
      short: round3(Math.max(0, required - line.inStock)),
      unitCostP: line.costP,
      costP: Math.round(required * line.costP),
    };
  });
}

/** Material cost of the whole quantity, in paise. Matches what production will post. */
export function requirementCostP(reqs: Requirement[]): number {
  return reqs.reduce((sum, r) => sum + r.costP, 0);
}

export function shortages(reqs: Requirement[]): Requirement[] {
  return reqs.filter((r) => r.short > 0);
}

/** How many finished pieces the current material stock supports. */
export function maxMakeable(lines: RecipeLine[]): number {
  const usable = lines.filter((l) => l.qtyPerUnit > 0);
  if (!usable.length) return 0;
  let best = Infinity;
  for (const line of usable) {
    const perPiece = line.qtyPerUnit * (1 + line.wastagePct / 100);
    best = Math.min(best, Math.floor((line.inStock + 1e-9) / perPiece));
  }
  let n = Number.isFinite(best) ? Math.max(0, best) : 0;
  // rounding to three decimals can make the last piece just miss; step back rather than promise it
  while (n > 0 && usable.some((line) => withWastage(line, n) > line.inStock)) n -= 1;
  return n;
}

/** One material's total requirement across several plans, for the shortage board. */
export function combineRequirements(all: Requirement[][]): Requirement[] {
  const byMaterial = new Map<string, Requirement>();
  for (const req of all.flat()) {
    const existing = byMaterial.get(req.materialId);
    if (!existing) {
      byMaterial.set(req.materialId, { ...req });
      continue;
    }
    existing.required = round3(existing.required + req.required);
    existing.costP += req.costP;
    existing.short = round3(Math.max(0, existing.required - existing.inStock));
  }
  return [...byMaterial.values()].sort((a, b) => b.short - a.short || a.name.localeCompare(b.name));
}
