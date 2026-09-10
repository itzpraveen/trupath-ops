"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { products } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireEditor } from "@/lib/auth";
import { errorMessage, parseForm, zBool, zInt, zOptional, zOptionalMoney, zOptionalUuid, zRequired, type ActionState } from "@/lib/forms";
import { adjustStock } from "@/lib/stock";

const schema = z.object({
  id: zOptionalUuid,
  brandId: zRequired("Brand", 40),
  name: zRequired("Product name", 150),
  variant: zOptional(100),
  sku: zOptional(60),
  category: zOptional(80),
  priceP: zOptionalMoney,
  costP: zOptionalMoney,
  minStock: zInt("Minimum stock").optional(),
  hsnCode: zOptional(12),
  gstRate: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        ctx.addIssue({ code: "custom", message: "GST rate must be a percentage between 0 and 100" });
        return z.NEVER;
      }
      return Math.round(n * 100) / 100;
    }),
  requiresComponentBilling: zBool,
  active: zBool,
  openingQty: zInt("Opening stock").optional(),
});

export async function saveProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("products");
    const parsed = parseForm(schema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    if (d.sku) {
      const [dup] = await db
        .select({ id: products.id })
        .from(products)
        .where(d.id ? and(eq(products.sku, d.sku), ne(products.id, d.id)) : eq(products.sku, d.sku))
        .limit(1);
      if (dup) return { error: `SKU ${d.sku} is already used by another product`, fieldErrors: { sku: ["Already used"] } };
    }
    const values = { brandId: d.brandId, name: d.name, variant: d.variant ?? "", sku: d.sku ?? null, category: d.category ?? null, priceP: d.priceP, costP: d.costP, minStock: d.minStock ?? 0, hsnCode: d.hsnCode ?? null, hsnLocked: !!d.hsnCode, gstRate: d.gstRate, requiresComponentBilling: d.requiresComponentBilling };
    let id = d.id;
    await db.transaction(async (tx) => {
      if (id) {
        await tx.update(products).set({ ...values, active: d.active }).where(eq(products.id, id));
      } else {
        const [row] = await tx.insert(products).values({ ...values, source: "manual" }).returning({ id: products.id });
        id = row.id;
        if (d.openingQty && d.openingQty > 0) await adjustStock(tx, { productId: id, kind: "count", qty: d.openingQty, note: "Opening stock", userId: user.id });
      }
      await audit(tx, { userId: user.id, action: d.id ? "update" : "create", entityType: "product", entityId: id, summary: `${d.id ? "Updated" : "Added"} product ${d.name} ${d.variant ?? ""}`.trim() });
    });
    for (const p of ["/products", "/stock", "/factory", "/"]) revalidatePath(p);
    return { ok: true, message: d.id ? "Product saved" : `${d.name} added`, id };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}
