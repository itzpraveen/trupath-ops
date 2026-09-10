"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireEditor } from "@/lib/auth";
import { applyCatalogueMappings } from "@/lib/catalogue-import";
import { errorMessage, parseForm, zBool, zRequired, type ActionState } from "@/lib/forms";

const schema = z.object({ brandId: zRequired("Brand", 40), mappings: z.string().max(40000), applyCosts: zBool, applyManualPrices: zBool });
const mappingsSchema = z.array(z.object({ ref: z.string().regex(/^stk-\d+$/), productId: z.string().uuid(), revision: z.string().regex(/^[a-f0-9]{64}$/) })).min(1).max(74);

export async function applySuppliedCatalogue(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("products");
    const parsed = parseForm(schema, formData);
    if (!parsed.ok) return parsed;
    let mappings;
    try { mappings = mappingsSchema.parse(JSON.parse(parsed.data.mappings)); }
    catch { return { error: "Choose the products to update, then review their matches." }; }
    const result = await applyCatalogueMappings({ ...parsed.data, mappings, userId: user.id });
    for (const path of ["/products", "/products/catalogue", "/stock", "/orders", "/sales/invoices"]) revalidatePath(path);
    return { ok: true, message: result.updated ? `Updated ${result.updated} products from the supplied catalogue.` : "These products already have the supplied details." };
  } catch (error) { return { error: errorMessage(error) }; }
}
