"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { attendance, bomLines, boms, employees, materialMovements, materials, productionChecks, productionEntries, productionPlans, products, dispatches, shopifyOrders, type AttendanceStatus } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireEditor } from "@/lib/auth";
import { errorMessage, parseForm, zBool, zDate, zEnum, zInt, zOptional, zOptionalMoney, zOptionalUuid, zPositiveInt, zRequired, zUuid, type ActionState } from "@/lib/forms";
import { adjustMaterial, round3 } from "@/lib/materials";
import { materialRequirement, requirementCostP } from "@/lib/production-plan";
import { nextNumber } from "@/lib/numbering";
import { adjustStock } from "@/lib/stock";
import { queueStockPush } from "@/lib/stock-push";

function revalidateFactory() {
  for (const p of ["/factory", "/factory/plan", "/factory/production", "/factory/materials", "/factory/attendance", "/factory/employees", "/stock", "/"]) revalidatePath(p);
}

/* ---------------- Production ---------------- */

const AUTO_CLOSE = "Planned quantity accepted by QC";

const productionSchema = z.object({
  workDate: zDate,
  productId: zUuid("product"),
  planId: zOptionalUuid,
  qty: zPositiveInt("Quantity"),
  employeeId: zOptionalUuid,
  workerName: zOptional(100),
  note: zOptional(1000),
  consumeMaterials: zBool,
  labourCostP: zOptionalMoney,
  shopifyOrderId: zOptional(40),
  shopifyLineId: zOptional(40),
});

export async function createProduction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("factory");
    const parsed = parseForm(productionSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    const result = await db.transaction(async (tx) => {
      if (d.shopifyOrderId) await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`order:${d.shopifyOrderId}`}, 0))`);
      const [product] = await tx.select().from(products).where(eq(products.id, d.productId)).limit(1);
      if (!product) throw new Error("Product not found");
      if (d.shopifyOrderId) {
        const [order] = await tx.select().from(shopifyOrders).where(eq(shopifyOrders.id, d.shopifyOrderId));
        const line = order?.lineItems.find(l => l.id === d.shopifyLineId && l.variantId === product.shopifyVariantId);
        if (!order || order.cancelledAt || order.localReturns || order.stockRestored || !product.shopifyVariantId || !line || line.quantity <= 0 || order.brandId !== product.brandId) throw new Error("Choose an active order line matching this product and brand");
        const [made] = await tx.select({ qty: sql<number>`coalesce(sum(${productionEntries.qty} - ${productionEntries.rejectedQty}),0)::int` }).from(productionEntries).where(and(eq(productionEntries.shopifyOrderId, order.id), eq(productionEntries.shopifyLineId, line.id), isNull(productionEntries.voidedAt)));
        if (d.qty > line.quantity - Math.max(made.qty, line.fulfilledQty ?? 0)) throw new Error(`Only ${Math.max(0, line.quantity - Math.max(made.qty, line.fulfilledQty ?? 0))} units remain to make for this order line`);
      } else if (d.shopifyLineId) throw new Error("Choose the order for this line");
      if (d.planId) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`plan:${d.planId}`}, 0))`);
        const [plan] = await tx.select().from(productionPlans).where(eq(productionPlans.id, d.planId)).limit(1);
        if (!plan || plan.status !== "open") throw new Error("That production plan is closed. Choose an open plan or record general production.");
        if (plan.productId !== d.productId) throw new Error("This plan is for a different product");
        const [done] = await tx
          .select({ made: sql<number>`coalesce(sum(${productionEntries.qty} - ${productionEntries.rejectedQty}),0)::int` })
          .from(productionEntries)
          .where(and(eq(productionEntries.planId, plan.id), isNull(productionEntries.voidedAt)));
        const left = plan.qty - done.made;
        if (d.qty > left) throw new Error(`Only ${Math.max(0, left)} pieces remain on ${plan.number}`);
      }
      let workerName = d.workerName ?? null;
      if (d.employeeId) {
        const [emp] = await tx.select({ name: employees.name }).from(employees).where(eq(employees.id, d.employeeId)).limit(1);
        workerName = emp?.name ?? workerName;
      }
      const number = await nextNumber(tx, "production", d.workDate);
      let bomId: string | null = null;
      let materialCostP = 0;
      let labourCostP = d.labourCostP;
      const consumed: string[] = [];
      if (d.consumeMaterials) {
        const [bom] = await tx.select().from(boms).where(and(eq(boms.productId, d.productId), eq(boms.active, true))).limit(1);
        if (!bom) throw new Error("Add an active material recipe, or record why material use is being entered separately in the note and untick recipe consumption");
        if (bom) {
          bomId = bom.id;
          if (!labourCostP) labourCostP = bom.labourCostP * d.qty;
          const lines = await tx
            .select({ materialId: bomLines.materialId, qtyPerUnit: bomLines.qtyPerUnit, wastagePct: bomLines.wastagePct, costP: materials.costP, name: materials.name, unit: materials.unit })
            .from(bomLines)
            .innerJoin(materials, eq(materials.id, bomLines.materialId))
            .where(eq(bomLines.bomId, bom.id));
          if (!lines.length) throw new Error("The material recipe has no lines. Complete it before recording material consumption.");
          for (const line of [...lines].sort((a,b) => a.materialId.localeCompare(b.materialId))) {
            const need = round3(line.qtyPerUnit * d.qty * (1 + line.wastagePct / 100));
            if (need <= 0) continue;
            await adjustMaterial(tx, { materialId: line.materialId, kind: "issue", qty: -need, unitCostP: line.costP, workDate: d.workDate, refType: "production", refId: number, note: `${number}: ${d.qty} × ${product.name}${product.variant ? ` ${product.variant}` : ""}`, userId: user.id });
            materialCostP += Math.round(need * line.costP);
            consumed.push(`${need} ${line.unit} ${line.name}`);
          }
        }
      } else if (!d.note) throw new Error("Add a note explaining how material use is recorded when recipe consumption is not selected");
      const [entry] = await tx
        .insert(productionEntries)
        .values({
          number,
          workDate: d.workDate,
          productId: d.productId,
          brandId: product.brandId,
          qty: d.qty,
          shopifyOrderId: d.shopifyOrderId ?? null,
          shopifyLineId: d.shopifyLineId ?? null,
          bomId,
          planId: d.planId ?? null,
          employeeId: d.employeeId ?? null,
          workerName,
          materialCostP,
          labourCostP,
          note: d.note ?? null,
          userId: user.id,
        })
        .returning({ id: productionEntries.id });
      await audit(tx, { userId: user.id, action: "create", entityType: "production", entityId: entry.id, summary: `${number}: ${d.qty} × ${product.name} ${product.variant}`.trim(), meta: { consumed } });
      return { id: entry.id, number, consumed, product };
    });
    revalidateFactory();
    if (d.shopifyOrderId) revalidatePath(`/orders/${d.shopifyOrderId}`);
    const msg = result.consumed.length ? `${result.number} recorded. Materials used: ${result.consumed.join(", ")}` : `${result.number} recorded`;
    return { ok: true, message: `${msg}. Waiting for QC; finished stock is added after acceptance.`, id: result.id };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

/** Accepted pieces on a plan, ignoring voided entries. */
async function acceptedOnPlan(tx: Tx, planId: string) {
  const [row] = await tx
    .select({ accepted: sql<number>`coalesce(sum(${productionEntries.acceptedQty}),0)::int` })
    .from(productionEntries)
    .where(and(eq(productionEntries.planId, planId), isNull(productionEntries.voidedAt)));
  return row.accepted;
}

/** A plan finishes itself once QC has accepted the planned quantity. */
async function closePlanIfMet(tx: Tx, planId: string) {
  const [plan] = await tx.select().from(productionPlans).where(eq(productionPlans.id, planId)).for("update");
  if (!plan || plan.status !== "open") return;
  if ((await acceptedOnPlan(tx, planId)) >= plan.qty) {
    await tx.update(productionPlans).set({ status: "done", closedAt: new Date(), closeReason: AUTO_CLOSE }).where(eq(productionPlans.id, planId));
  }
}

/** Voiding accepted output puts an automatically finished plan back on the list. */
async function reopenPlanIfShort(tx: Tx, planId: string) {
  const [plan] = await tx.select().from(productionPlans).where(eq(productionPlans.id, planId)).for("update");
  if (plan?.status !== "done" || plan.closeReason !== AUTO_CLOSE) return;
  if ((await acceptedOnPlan(tx, planId)) < plan.qty) {
    await tx.update(productionPlans).set({ status: "open", closedAt: null, closeReason: null }).where(eq(productionPlans.id, planId));
  }
}

const voidSchema = z.object({ id: zRequired("Entry"), reason: zRequired("Reason", 500) });

export async function voidProduction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("factory");
    const parsed = parseForm(voidSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const { id, reason } = parsed.data;
    const productId = await db.transaction(async (tx) => {
      const [ref] = await tx.select({ orderId: productionEntries.shopifyOrderId }).from(productionEntries).where(eq(productionEntries.id, id));
      if (ref?.orderId) await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`order:${ref.orderId}`}, 0))`);
      const [entry] = await tx.select().from(productionEntries).where(eq(productionEntries.id, id)).for("update");
      if (!entry) throw new Error("Entry not found");
      if (entry.voidedAt) throw new Error("Already voided");
      if (entry.shopifyOrderId) {
        const [sent] = await tx.select({id: dispatches.id}).from(dispatches).where(and(eq(dispatches.shopifyOrderId, entry.shopifyOrderId), sql`${dispatches.shippedAt} is not null`));
        if (sent) throw new Error("This production belongs to a shipped order. Reconcile it through a return instead of voiding.");
      }
      if (entry.acceptedQty) await adjustStock(tx, { productId: entry.productId, kind: "adjustment", qty: -entry.acceptedQty, refType: "production_void", refId: entry.number, note: `Voided ${entry.number}: ${reason}`, userId: user.id });
      const used = await tx.select().from(materialMovements).where(and(eq(materialMovements.refType, "production"), eq(materialMovements.refId, entry.number)));
      for (const m of used) {
        await adjustMaterial(tx, { materialId: m.materialId, kind: "return", qty: -m.qty, refType: "production_void", refId: entry.number, note: `Returned from voided ${entry.number}`, userId: user.id });
      }
      await tx.update(productionEntries).set({ voidedAt: new Date(), voidReason: reason }).where(eq(productionEntries.id, id));
      if (entry.planId) await reopenPlanIfShort(tx, entry.planId);
      await audit(tx, { userId: user.id, action: "void", entityType: "production", entityId: id, summary: `Voided ${entry.number}: ${reason}` });
      return entry.productId;
    });
    queueStockPush([productId]);
    revalidateFactory();
    return { ok: true, message: "Production entry voided and stock reversed" };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function inspectProduction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("factory");
    const parsed = parseForm(z.object({ id: zUuid("production"), revision: zInt("Revision"), acceptedQty: zInt("Accepted quantity"), rejectedQty: zInt("Rejected quantity"), note: zRequired("Inspection note", 1000) }), formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    const result = await db.transaction(async tx => {
      const [ref] = await tx.select({ orderId: productionEntries.shopifyOrderId }).from(productionEntries).where(eq(productionEntries.id, d.id));
      if (ref?.orderId) await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`order:${ref.orderId}`}, 0))`);
      const [entry] = await tx.select().from(productionEntries).where(eq(productionEntries.id, d.id)).for("update");
      if (!entry || entry.voidedAt || !entry.qcRequired) throw new Error("This production entry is not awaiting QC");
      if (entry.qcRevision !== d.revision) throw new Error("This batch was already updated. Refresh and review the remaining quantity.");
      const remaining = entry.qty - entry.acceptedQty - entry.rejectedQty;
      if (d.acceptedQty + d.rejectedQty < 1 || d.acceptedQty + d.rejectedQty > remaining) throw new Error(`Inspect between 1 and ${remaining} remaining units`);
      if (d.acceptedQty) await adjustStock(tx, { productId: entry.productId, kind: "production_in", qty: d.acceptedQty, refType: "production_qc", refId: entry.id, note: `${entry.number}: QC accepted. ${d.note}`, userId: user.id });
      await tx.insert(productionChecks).values({ productionId: entry.id, acceptedQty: d.acceptedQty, rejectedQty: d.rejectedQty, note: d.note, userId: user.id });
      await tx.update(productionEntries).set({ acceptedQty: entry.acceptedQty + d.acceptedQty, rejectedQty: entry.rejectedQty + d.rejectedQty, qcRevision: entry.qcRevision + 1 }).where(eq(productionEntries.id, entry.id));
      if (entry.planId) await closePlanIfMet(tx, entry.planId);
      await audit(tx, { userId: user.id, action: "qc", entityType: "production", entityId: entry.id, summary: `${entry.number}: ${d.acceptedQty} accepted, ${d.rejectedQty} rejected`, meta: { note: d.note } });
      return entry;
    });
    if (d.acceptedQty) queueStockPush([result.productId]);
    revalidateFactory();
    if (result.shopifyOrderId) revalidatePath(`/orders/${result.shopifyOrderId}`);
    return { ok: true, message: `QC saved. ${d.acceptedQty} units added to finished stock.` };
  } catch (err) { return { error: errorMessage(err) }; }
}

/* ---------------- Production plan ---------------- */

const planSchema = z.object({
  productId: zUuid("product"),
  qty: zPositiveInt("Quantity"),
  targetDate: zDate,
  note: zOptional(1000),
  shopifyOrderId: zOptional(40),
  shopifyLineId: zOptional(40),
});

export async function createProductionPlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("factory");
    const parsed = parseForm(planSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    const result = await db.transaction(async (tx) => {
      const [product] = await tx.select().from(products).where(eq(products.id, d.productId)).limit(1);
      if (!product) throw new Error("Product not found");
      if (d.shopifyOrderId) {
        const [order] = await tx.select().from(shopifyOrders).where(eq(shopifyOrders.id, d.shopifyOrderId));
        const line = order?.lineItems.find((l) => l.id === d.shopifyLineId && l.variantId === product.shopifyVariantId);
        if (!order || order.cancelledAt || !line || order.brandId !== product.brandId) throw new Error("Choose an active order line matching this product and brand");
      } else if (d.shopifyLineId) throw new Error("Choose the order for this line");

      // estimate from the recipe in use, so the plan shows a cost even before anything is made
      const [bom] = await tx.select().from(boms).where(and(eq(boms.productId, d.productId), eq(boms.active, true))).limit(1);
      let materialCostP = 0;
      if (bom) {
        const lines = await tx
          .select({ materialId: bomLines.materialId, qtyPerUnit: bomLines.qtyPerUnit, wastagePct: bomLines.wastagePct, name: materials.name, unit: materials.unit, costP: materials.costP, inStock: materials.qty })
          .from(bomLines)
          .innerJoin(materials, eq(materials.id, bomLines.materialId))
          .where(eq(bomLines.bomId, bom.id));
        materialCostP = requirementCostP(materialRequirement(lines, d.qty));
      }
      const number = await nextNumber(tx, "plan", d.targetDate);
      const [row] = await tx
        .insert(productionPlans)
        .values({
          number,
          productId: d.productId,
          brandId: product.brandId,
          qty: d.qty,
          targetDate: d.targetDate,
          bomId: bom?.id ?? null,
          materialCostP,
          labourCostP: (bom?.labourCostP ?? 0) * d.qty,
          shopifyOrderId: d.shopifyOrderId ?? null,
          shopifyLineId: d.shopifyLineId ?? null,
          note: d.note ?? null,
          userId: user.id,
        })
        .returning({ id: productionPlans.id });
      await audit(tx, { userId: user.id, action: "create", entityType: "production_plan", entityId: row.id, summary: `${number}: make ${d.qty} × ${product.name}${product.variant ? ` ${product.variant}` : ""}`.trim() });
      return { id: row.id, number, hasRecipe: !!bom };
    });
    revalidateFactory();
    return { ok: true, message: result.hasRecipe ? `${result.number} added to the plan` : `${result.number} added to the plan. Add a material recipe to get its cost and shortages.`, id: result.id };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function closeProductionPlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("factory");
    const parsed = parseForm(z.object({ id: zUuid("plan"), reason: zOptional(500) }), formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const { id, reason } = parsed.data;
    const number = await db.transaction(async (tx) => {
      const [plan] = await tx.select().from(productionPlans).where(eq(productionPlans.id, id)).for("update");
      if (!plan) throw new Error("Plan not found");
      if (plan.status !== "open") throw new Error("This plan is already closed");
      await tx.update(productionPlans).set({ status: "done", closedAt: new Date(), closeReason: reason ?? "Closed by the factory" }).where(eq(productionPlans.id, id));
      await audit(tx, { userId: user.id, action: "close", entityType: "production_plan", entityId: id, summary: `${plan.number} closed${reason ? `: ${reason}` : ""}` });
      return plan.number;
    });
    revalidateFactory();
    return { ok: true, message: `${number} closed` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function cancelProductionPlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("factory");
    const parsed = parseForm(z.object({ id: zUuid("plan"), reason: zRequired("Reason", 500) }), formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const { id, reason } = parsed.data;
    const number = await db.transaction(async (tx) => {
      const [plan] = await tx.select().from(productionPlans).where(eq(productionPlans.id, id)).for("update");
      if (!plan) throw new Error("Plan not found");
      if (plan.status === "cancelled") throw new Error("This plan is already cancelled");
      const [made] = await tx
        .select({ qty: sql<number>`coalesce(sum(${productionEntries.qty}),0)::int` })
        .from(productionEntries)
        .where(and(eq(productionEntries.planId, id), isNull(productionEntries.voidedAt)));
      if (made.qty > 0) throw new Error(`${made.qty} pieces were already recorded against this plan. Close it instead of cancelling.`);
      await tx.update(productionPlans).set({ status: "cancelled", closedAt: new Date(), closeReason: reason }).where(eq(productionPlans.id, id));
      await audit(tx, { userId: user.id, action: "cancel", entityType: "production_plan", entityId: id, summary: `${plan.number} cancelled: ${reason}` });
      return plan.number;
    });
    revalidateFactory();
    return { ok: true, message: `${number} cancelled` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

/* ---------------- Attendance ---------------- */

const STATUSES = ["present", "half_day", "absent", "leave", "holiday"] as const;

export async function setAttendance(input: { employeeId: string; workDate: string; status: AttendanceStatus }): Promise<ActionState> {
  try {
    const user = await requireEditor("attendance");
    const parsed = z.object({ employeeId: zUuid("employee"), workDate: zDate, status: zEnum(STATUSES, "status") }).safeParse(input);
    if (!parsed.success) return { error: "Invalid attendance entry" };
    const d = parsed.data;
    await db.transaction(async (tx) => {
      const [emp] = await tx.select({ name: employees.name }).from(employees).where(eq(employees.id, d.employeeId)).limit(1);
      if (!emp) throw new Error("Staff member not found");
      await tx
        .insert(attendance)
        .values({ employeeId: d.employeeId, workDate: d.workDate, status: d.status, userId: user.id })
        .onConflictDoUpdate({ target: [attendance.employeeId, attendance.workDate], set: { status: d.status, userId: user.id, updatedAt: new Date() } });
      await audit(tx, { userId: user.id, action: "attendance", entityType: "attendance", entityId: d.employeeId, summary: `${emp.name} ${d.workDate}: ${d.status.replace("_", " ")}` });
    });
    revalidatePath("/factory");
    revalidatePath("/factory/attendance");
    revalidatePath("/");
    return { ok: true, message: "Attendance saved" };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const attendanceDetailsSchema = z.object({
  employeeId: zUuid("employee"),
  workDate: zDate,
  status: zEnum(STATUSES, "status"),
  checkIn: zOptional(5),
  checkOut: zOptional(5),
  overtimeMin: zInt("Overtime").optional(),
  note: zOptional(500),
});

export async function saveAttendanceDetails(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("attendance");
    const parsed = parseForm(attendanceDetailsSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    const set = { status: d.status, checkIn: d.checkIn ?? null, checkOut: d.checkOut ?? null, overtimeMin: d.overtimeMin ?? 0, note: d.note ?? null, userId: user.id, updatedAt: new Date() };
    await db.transaction(async (tx) => {
      const [emp] = await tx.select({ name: employees.name }).from(employees).where(eq(employees.id, d.employeeId)).limit(1);
      if (!emp) throw new Error("Staff member not found");
      await tx
        .insert(attendance)
        .values({ employeeId: d.employeeId, workDate: d.workDate, ...set })
        .onConflictDoUpdate({ target: [attendance.employeeId, attendance.workDate], set });
      const details = [d.checkIn && `in ${d.checkIn}`, d.checkOut && `out ${d.checkOut}`, d.overtimeMin && `${d.overtimeMin} min overtime`].filter(Boolean).join(", ");
      await audit(tx, { userId: user.id, action: "attendance", entityType: "attendance", entityId: d.employeeId, summary: `${emp.name} ${d.workDate}: ${d.status.replace("_", " ")}${details ? ` (${details})` : ""}` });
    });
    revalidatePath("/factory");
    revalidatePath("/factory/attendance");
    return { ok: true, message: "Attendance saved" };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

/* ---------------- Employees ---------------- */

const employeeSchema = z.object({
  id: zOptionalUuid,
  code: zRequired("Staff code", 20),
  name: zRequired("Name", 100),
  designation: zOptional(100),
  phone: zOptional(20),
  joinedAt: z.string().optional().transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)),
  dailyWageP: zOptionalMoney,
  active: zBool,
});

export async function saveEmployee(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("attendance");
    const parsed = parseForm(employeeSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    const values = { code: d.code, name: d.name, designation: d.designation ?? "", phone: d.phone ?? null, joinedAt: d.joinedAt, dailyWageP: d.dailyWageP, active: d.id ? d.active : true };
    if (d.id) {
      await db.update(employees).set(values).where(eq(employees.id, d.id));
    } else {
      const [dup] = await db.select({ id: employees.id }).from(employees).where(eq(employees.code, d.code)).limit(1);
      if (dup) return { error: `Staff code ${d.code} is already used`, fieldErrors: { code: ["Already used"] } };
      await db.insert(employees).values(values);
    }
    await audit(db, { userId: user.id, action: d.id ? "update" : "create", entityType: "employee", entityId: d.id ?? null, summary: `${d.id ? "Updated" : "Added"} staff ${d.name}` });
    revalidateFactory();
    return { ok: true, message: d.id ? "Staff details saved" : `${d.name} added` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}
