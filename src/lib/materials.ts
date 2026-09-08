import { eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { materialMovements, materials, type MaterialMovementKind } from "@/db/schema";
import { todayIST } from "@/lib/dates";

export const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Change a raw-material balance inside a transaction and write the movement.
 * `qty` is a signed delta, except for kind "count" where it is the counted absolute quantity.
 */
export async function adjustMaterial(
  tx: Tx,
  input: {
    materialId: string;
    kind: MaterialMovementKind;
    qty: number;
    unitCostP?: number | null;
    /** YYYY-MM-DD the movement belongs to; defaults to today in India. */
    workDate?: string;
    refType?: string;
    refId?: string;
    note?: string;
    userId?: string | null;
    allowNegative?: boolean;
  },
) {
  const [m] = await tx
    .select({ id: materials.id, qty: materials.qty, name: materials.name, unit: materials.unit })
    .from(materials)
    .where(eq(materials.id, input.materialId))
    .for("update");
  if (!m) throw new Error("Material not found");
  const before = round3(m.qty);
  const delta = round3(input.kind === "count" ? input.qty - before : input.qty);
  const after = round3(before + delta);
  if (after < 0 && !input.allowNegative) {
    throw new Error(`Not enough ${m.name}: only ${before} ${m.unit} in stock`);
  }
  await tx
    .update(materials)
    .set({ qty: after, ...(input.kind === "count" ? { lastCountAt: new Date() } : {}) })
    .where(eq(materials.id, m.id));
  await tx.insert(materialMovements).values({
    materialId: m.id,
    kind: input.kind,
    qty: delta,
    beforeQty: before,
    afterQty: after,
    unitCostP: input.unitCostP ?? null,
    workDate: input.workDate ?? todayIST(),
    refType: input.refType ?? null,
    refId: input.refId ?? null,
    note: input.note ?? null,
    userId: input.userId ?? null,
  });
  return { before, after, delta };
}
