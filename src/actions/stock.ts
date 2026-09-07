"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { products } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireEditor } from "@/lib/auth";
import { errorMessage, parseForm, zEnum, zInt, zOptional, zUuid, type ActionState } from "@/lib/forms";
import { adjustStock } from "@/lib/stock";

const KINDS = ["purchase_in", "return_in", "adjustment", "count"] as const;
const schema = z.object({
  productId: zUuid("product"),
  kind: zEnum(KINDS, "movement type"),
  qty: zInt("Quantity", 0),
  direction: z.enum(["add", "remove"]).optional(),
  reference: zOptional(100),
  note: zOptional(500),
});

function revalidateStock() {
  for (const p of ["/stock", "/products", "/dispatch", "/factory", "/"]) revalidatePath(p);
}

export async function stockMovement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("stock");
    const parsed = parseForm(schema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    if (d.kind !== "count" && d.qty <= 0) return { error: "Quantity must be greater than zero", fieldErrors: { qty: ["Must be greater than zero"] } };
    const qty = d.kind === "count" ? d.qty : d.kind === "adjustment" && d.direction === "remove" ? -d.qty : d.qty;
    const result = await db.transaction(async (tx) => {
      const [p] = await tx.select({ name: products.name, variant: products.variant }).from(products).where(eq(products.id, d.productId)).limit(1);
      if (!p) throw new Error("Product not found");
      const r = await adjustStock(tx, { productId: d.productId, kind: d.kind, qty, refType: "manual", refId: d.reference, note: d.note, userId: user.id });
      await audit(tx, { userId: user.id, action: d.kind, entityType: "product", entityId: d.productId, summary: `${p.name} ${p.variant}: ${d.kind} ${r.delta > 0 ? "+" : ""}${r.delta} (${r.before} → ${r.after})`.trim() });
      return { p, r };
    });
    revalidateStock();
    revalidatePath(`/stock/${d.productId}`);
    return { ok: true, message: `${result.p.name}${result.p.variant ? ` ${result.p.variant}` : ""} now ${result.r.after} in stock` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}
