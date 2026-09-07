"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { attendance, bomLines, boms, employees, materialMovements, materials, productionEntries, products, type AttendanceStatus } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireEditor } from "@/lib/auth";
import { errorMessage, parseForm, zBool, zDate, zEnum, zInt, zOptional, zOptionalMoney, zOptionalUuid, zPositiveInt, zRequired, zUuid, type ActionState } from "@/lib/forms";
import { adjustMaterial, round3 } from "@/lib/materials";
import { nextNumber } from "@/lib/numbering";
import { adjustStock } from "@/lib/stock";

function revalidateFactory() {
  for (const p of ["/factory", "/factory/production", "/factory/materials", "/factory/attendance", "/factory/employees", "/stock", "/"]) revalidatePath(p);
}

/* ---------------- Production ---------------- */

const productionSchema = z.object({
  workDate: zDate,
  productId: zUuid("product"),
  qty: zPositiveInt("Quantity"),
  employeeId: zOptionalUuid,
  workerName: zOptional(100),
  note: zOptional(1000),
  consumeMaterials: zBool,
  labourCostP: zOptionalMoney,
});

export async function createProduction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("factory");
    const parsed = parseForm(productionSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    const result = await db.transaction(async (tx) => {
      const [product] = await tx.select().from(products).where(eq(products.id, d.productId)).limit(1);
      if (!product) throw new Error("Product not found");
      let workerName = d.workerName ?? null;
      if (d.employeeId) {
        const [emp] = await tx.select({ name: employees.name }).from(employees).where(eq(employees.id, d.employeeId)).limit(1);
        workerName = emp?.name ?? workerName;
      }
      const number = await nextNumber(tx, "production", d.workDate);
      let bomId: string | null = null;
      let materialCostP = 0;
      const consumed: string[] = [];
      if (d.consumeMaterials) {
        const [bom] = await tx.select().from(boms).where(and(eq(boms.productId, d.productId), eq(boms.active, true))).limit(1);
        if (bom) {
          bomId = bom.id;
          const lines = await tx
            .select({ materialId: bomLines.materialId, qtyPerUnit: bomLines.qtyPerUnit, wastagePct: bomLines.wastagePct, costP: materials.costP, name: materials.name, unit: materials.unit })
            .from(bomLines)
            .innerJoin(materials, eq(materials.id, bomLines.materialId))
            .where(eq(bomLines.bomId, bom.id));
          for (const line of lines) {
            const need = round3(line.qtyPerUnit * d.qty * (1 + line.wastagePct / 100));
            if (need <= 0) continue;
            await adjustMaterial(tx, { materialId: line.materialId, kind: "issue", qty: -need, unitCostP: line.costP, refType: "production", refId: number, note: `${number}: ${d.qty} × ${product.name}${product.variant ? ` ${product.variant}` : ""}`, userId: user.id });
            materialCostP += Math.round(need * line.costP);
            consumed.push(`${need} ${line.unit} ${line.name}`);
          }
        }
      }
      const [entry] = await tx
        .insert(productionEntries)
        .values({
          number,
          workDate: d.workDate,
          productId: d.productId,
          brandId: product.brandId,
          qty: d.qty,
          bomId,
          employeeId: d.employeeId ?? null,
          workerName,
          materialCostP,
          labourCostP: d.labourCostP,
          note: d.note ?? null,
          userId: user.id,
        })
        .returning({ id: productionEntries.id });
      await adjustStock(tx, { productId: d.productId, kind: "production_in", qty: d.qty, refType: "production", refId: number, note: `Produced ${number}${workerName ? ` by ${workerName}` : ""}`, userId: user.id });
      await audit(tx, { userId: user.id, action: "create", entityType: "production", entityId: entry.id, summary: `${number}: ${d.qty} × ${product.name} ${product.variant}`.trim(), meta: { consumed } });
      return { id: entry.id, number, consumed, product };
    });
    revalidateFactory();
    const msg = result.consumed.length ? `${result.number} recorded. Materials used: ${result.consumed.join(", ")}` : `${result.number} recorded`;
    return { ok: true, message: msg, id: result.id };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const voidSchema = z.object({ id: zRequired("Entry"), reason: zRequired("Reason", 500) });

export async function voidProduction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("factory");
    const parsed = parseForm(voidSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const { id, reason } = parsed.data;
    await db.transaction(async (tx) => {
      const [entry] = await tx.select().from(productionEntries).where(eq(productionEntries.id, id)).for("update");
      if (!entry) throw new Error("Entry not found");
      if (entry.voidedAt) throw new Error("Already voided");
      await adjustStock(tx, { productId: entry.productId, kind: "adjustment", qty: -entry.qty, refType: "production_void", refId: entry.number, note: `Voided ${entry.number}: ${reason}`, userId: user.id, allowNegative: true });
      const used = await tx.select().from(materialMovements).where(and(eq(materialMovements.refType, "production"), eq(materialMovements.refId, entry.number)));
      for (const m of used) {
        await adjustMaterial(tx, { materialId: m.materialId, kind: "return", qty: -m.qty, refType: "production_void", refId: entry.number, note: `Returned from voided ${entry.number}`, userId: user.id });
      }
      await tx.update(productionEntries).set({ voidedAt: new Date(), voidReason: reason }).where(eq(productionEntries.id, id));
      await audit(tx, { userId: user.id, action: "void", entityType: "production", entityId: id, summary: `Voided ${entry.number}: ${reason}` });
    });
    revalidateFactory();
    return { ok: true, message: "Production entry voided and stock reversed" };
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
    await db
      .insert(attendance)
      .values({ employeeId: d.employeeId, workDate: d.workDate, status: d.status, userId: user.id })
      .onConflictDoUpdate({ target: [attendance.employeeId, attendance.workDate], set: { status: d.status, userId: user.id, updatedAt: new Date() } });
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
    await db
      .insert(attendance)
      .values({ employeeId: d.employeeId, workDate: d.workDate, ...set })
      .onConflictDoUpdate({ target: [attendance.employeeId, attendance.workDate], set });
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
