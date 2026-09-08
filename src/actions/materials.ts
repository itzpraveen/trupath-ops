"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { bomLines, boms, businessRecords, materials, productionEntries, products } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireEditor } from "@/lib/auth";
import { todayIST } from "@/lib/dates";
import { errorMessage, parseForm, zBool, zDate, zEnum, zNumber, zOptional, zOptionalMoney, zOptionalUuid, zRequired, zUuid, type ActionState } from "@/lib/forms";
import { adjustMaterial, round3 } from "@/lib/materials";
import { formatINR, formatQty } from "@/lib/money";
import { nextNumber } from "@/lib/numbering";

function revalidateMaterials() {
  for (const p of ["/factory", "/factory/materials", "/factory/boms", "/sales", "/reports", "/"]) revalidatePath(p);
}

const materialSchema = z.object({
  id: zOptionalUuid,
  code: zRequired("Code", 20),
  name: zRequired("Name", 120),
  unit: zRequired("Unit", 20),
  minQty: zNumber("Minimum stock").optional(),
  costP: zOptionalMoney,
  active: zBool,
  openingQty: zNumber("Opening stock").optional(),
});

export async function saveMaterial(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("materials");
    const parsed = parseForm(materialSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    const [dup] = await db
      .select({ id: materials.id })
      .from(materials)
      .where(d.id ? and(eq(materials.code, d.code), ne(materials.id, d.id)) : eq(materials.code, d.code))
      .limit(1);
    if (dup) return { error: `Code ${d.code} is already used`, fieldErrors: { code: ["Already used"] } };
    if (d.id) {
      await db.update(materials).set({ code: d.code, name: d.name, unit: d.unit, minQty: d.minQty ?? 0, costP: d.costP, active: d.active }).where(eq(materials.id, d.id));
      revalidateMaterials();
      return { ok: true, message: "Material saved" };
    }
    const id = await db.transaction(async (tx) => {
      const [row] = await tx.insert(materials).values({ code: d.code, name: d.name, unit: d.unit, minQty: d.minQty ?? 0, costP: d.costP, active: true }).returning({ id: materials.id });
      if (d.openingQty && d.openingQty > 0) {
        await adjustMaterial(tx, { materialId: row.id, kind: "count", qty: d.openingQty, note: "Opening stock", userId: user.id });
      }
      await audit(tx, { userId: user.id, action: "create", entityType: "material", entityId: row.id, summary: `Added material ${d.code} ${d.name}` });
      return row.id;
    });
    revalidateMaterials();
    return { ok: true, message: `${d.name} added`, id };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const MOVEMENT_KINDS = ["purchase", "issue", "return", "adjustment", "count"] as const;
const movementSchema = z.object({
  materialId: zUuid("material"),
  kind: zEnum(MOVEMENT_KINDS, "movement type"),
  qty: zNumber("Quantity"),
  direction: z.enum(["add", "remove"]).optional(),
  unitCostP: zOptionalMoney,
  workDate: zDate.optional(),
  contactId: zOptionalUuid,
  reference: zOptional(100),
  paymentMethod: zOptional(20),
  recordExpense: zBool,
  note: zOptional(500),
});

export async function recordMaterialMovement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("materials");
    const parsed = parseForm(movementSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    if (d.kind !== "count" && d.qty <= 0) return { error: "Quantity must be greater than zero", fieldErrors: { qty: ["Must be greater than zero"] } };
    const workDate = d.workDate ?? todayIST();
    const result = await db.transaction(async (tx) => {
      const [m] = await tx.select().from(materials).where(eq(materials.id, d.materialId)).limit(1);
      if (!m) throw new Error("Material not found");
      let delta = d.qty;
      if (d.kind === "issue") delta = -d.qty;
      if (d.kind === "adjustment") delta = d.direction === "remove" ? -d.qty : d.qty;
      let refId: string | undefined;
      let expenseNumber: string | undefined;
      if (d.kind === "purchase" && d.recordExpense && d.unitCostP > 0) {
        expenseNumber = await nextNumber(tx, "purchase", workDate);
        const amountP = Math.round(d.qty * d.unitCostP);
        await tx.insert(businessRecords).values({
          number: expenseNumber,
          entityId: "factory",
          kind: "purchase",
          workDate,
          amountP,
          category: "Raw material purchase",
          reference: d.reference ?? "",
          contactId: d.contactId ?? null,
          paymentMethod: (d.paymentMethod as "cash") || "cash",
          paymentTerms: d.paymentMethod === "credit" ? "credit" : "paid",
          source: "manual",
          note: `${formatQty(d.qty, m.unit)} ${m.name}${d.note ? ` · ${d.note}` : ""}`,
          userId: user.id,
        });
        refId = expenseNumber;
      }
      const r = await adjustMaterial(tx, {
        materialId: d.materialId,
        kind: d.kind,
        qty: d.kind === "count" ? d.qty : delta,
        unitCostP: d.unitCostP || null,
        workDate,
        refType: d.kind === "purchase" ? "purchase" : "manual",
        // the expense number when one was posted, else the supplier's bill number
        refId: refId ?? (d.kind === "purchase" && d.reference ? `Bill ${d.reference}` : undefined),
        note: d.note,
        userId: user.id,
      });
      if (d.kind === "purchase" && d.unitCostP > 0) {
        await tx.update(materials).set({ costP: d.unitCostP }).where(eq(materials.id, d.materialId));
      }
      await audit(tx, { userId: user.id, action: d.kind, entityType: "material", entityId: m.id, summary: `${m.name}: ${d.kind} ${formatQty(r.delta, m.unit)} (${r.before} → ${r.after})` });
      return { m, r, expenseNumber };
    });
    revalidateMaterials();
    const label = { purchase: "Purchase", issue: "Usage", return: "Return", adjustment: "Adjustment", count: "Stock count" }[d.kind];
    return {
      ok: true,
      message: `${label} saved · ${result.m.name} now ${formatQty(result.r.after, result.m.unit)}${result.expenseNumber ? ` · expense ${result.expenseNumber} (${formatINR(Math.round(d.qty * d.unitCostP))}) recorded` : ""}`,
    };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

/* ---------------- Recipes (BOM) ---------------- */

const bomSchema = z.object({
  id: zOptionalUuid,
  productId: zUuid("product"),
  version: zOptional(20),
  labourCostP: zOptionalMoney,
  note: zOptional(500),
  materialId: z.array(z.string()).optional(),
  qtyPerUnit: z.array(z.string()).optional(),
  wastagePct: z.array(z.string()).optional(),
});

export async function saveBom(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("materials");
    const parsed = parseForm(bomSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    const ids = d.materialId ?? [];
    const listed = ids
      .map((materialId, i) => ({ materialId, qtyPerUnit: round3(Number(d.qtyPerUnit?.[i] ?? 0)), wastagePct: Math.max(0, Number(d.wastagePct?.[i] ?? 0) || 0) }))
      .filter((l) => /^[0-9a-f-]{36}$/i.test(l.materialId));
    // a chosen material with no quantity is a mistake, not something to drop quietly
    if (listed.some((l) => !(l.qtyPerUnit > 0))) return { error: "Enter the quantity per unit for every material, or remove the empty line", fieldErrors: { qtyPerUnit: ["Missing quantity"] } };
    const lines = listed;
    if (!lines.length) return { error: "Add at least one material with a quantity per unit" };
    const seen = new Set<string>();
    for (const l of lines) {
      if (seen.has(l.materialId)) return { error: "A material is listed twice. Combine the lines." };
      seen.add(l.materialId);
    }
    const id = await db.transaction(async (tx) => {
      const [product] = await tx.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, d.productId)).limit(1);
      if (!product) throw new Error("Product not found");
      let bomId = d.id;
      if (bomId) {
        await tx.update(boms).set({ productId: d.productId, version: d.version ?? "V1", labourCostP: d.labourCostP, note: d.note ?? null }).where(eq(boms.id, bomId));
        await tx.delete(bomLines).where(eq(bomLines.bomId, bomId));
      } else {
        const [row] = await tx.insert(boms).values({ productId: d.productId, version: d.version ?? "V1", labourCostP: d.labourCostP, note: d.note ?? null }).returning({ id: boms.id });
        bomId = row.id;
      }
      // one active recipe per product
      await tx.update(boms).set({ active: false }).where(and(eq(boms.productId, d.productId), ne(boms.id, bomId)));
      await tx.update(boms).set({ active: true }).where(eq(boms.id, bomId));
      await tx.insert(bomLines).values(lines.map((l) => ({ bomId: bomId!, ...l })));
      await audit(tx, { userId: user.id, action: d.id ? "update" : "create", entityType: "bom", entityId: bomId, summary: `Recipe for ${product.name} (${lines.length} materials)` });
      return bomId;
    });
    revalidateMaterials();
    return { ok: true, message: "Recipe saved", id };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function deleteBom(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("materials");
    const id = String(formData.get("id") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Recipe not found" };
    await db.transaction(async (tx) => {
      const [bom] = await tx.select({ id: boms.id }).from(boms).where(eq(boms.id, id)).limit(1);
      if (!bom) throw new Error("Recipe not found");
      // production entries keep their recorded material usage; they just stop pointing at the recipe
      await tx.update(productionEntries).set({ bomId: null }).where(eq(productionEntries.bomId, id));
      await tx.delete(boms).where(eq(boms.id, id));
      await audit(tx, { userId: user.id, action: "delete", entityType: "bom", entityId: id, summary: "Deleted recipe" });
    });
    revalidateMaterials();
    return { ok: true, message: "Recipe deleted" };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}
