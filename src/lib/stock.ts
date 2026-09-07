import { eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { products, stockMovements, type StockMovementKind } from "@/db/schema";

/**
 * Change finished-goods stock inside a transaction and write the movement.
 * `qty` is a signed delta, except for kind "count" where it is the counted absolute quantity.
 */
export async function adjustStock(
  tx: Tx,
  input: {
    productId: string;
    kind: StockMovementKind;
    qty: number;
    refType?: string;
    refId?: string;
    note?: string;
    userId?: string | null;
    allowNegative?: boolean;
  },
) {
  const [p] = await tx
    .select({ id: products.id, stockQty: products.stockQty, name: products.name, variant: products.variant })
    .from(products)
    .where(eq(products.id, input.productId))
    .for("update");
  if (!p) throw new Error("Product not found");
  const before = p.stockQty;
  const delta = input.kind === "count" ? input.qty - before : input.qty;
  const after = before + delta;
  if (after < 0 && !input.allowNegative) {
    throw new Error(`Not enough stock of ${p.name}${p.variant ? ` (${p.variant})` : ""}: only ${before} available`);
  }
  await tx.update(products).set({ stockQty: after }).where(eq(products.id, p.id));
  await tx.insert(stockMovements).values({
    productId: p.id,
    kind: input.kind,
    qty: delta,
    beforeQty: before,
    afterQty: after,
    refType: input.refType ?? null,
    refId: input.refId ?? null,
    note: input.note ?? null,
    userId: input.userId ?? null,
  });
  return { before, after, delta };
}
