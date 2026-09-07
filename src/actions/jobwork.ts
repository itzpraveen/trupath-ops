"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { businessRecords, contacts, jobWorkMaterials, jobWorkOrders, jobWorkReceipts, materials, products, type JobWorkStatus } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireEditor } from "@/lib/auth";
import { errorMessage, parseForm, zBool, zDate, zEnum, zInt, zNumber, zOptional, zOptionalMoney, zOptionalUuid, zUuid, type ActionState } from "@/lib/forms";
import { adjustMaterial, round3 } from "@/lib/materials";
import { formatINR } from "@/lib/money";
import { nextNumber } from "@/lib/numbering";
import { adjustStock } from "@/lib/stock";

function revalidateJobWork(id?: string) {
  for (const p of ["/jobwork", "/factory", "/factory/materials", "/stock", "/sales", "/payments", "/"]) revalidatePath(p);
  if (id) revalidatePath(`/jobwork/${id}`);
}

const headerSchema = z.object({
  vendorId: zUuid("job worker"),
  workDate: zDate,
  dueDate: z.string().optional().transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)),
  process: zOptional(60),
  productId: zOptionalUuid,
  description: zOptional(500),
  orderedQty: zInt("Quantity", 0),
  ratePerUnitP: zOptionalMoney,
  taxPct: zNumber("Tax %").optional(),
  note: zOptional(1000),
});
const createSchema = headerSchema.extend({
  sendNow: zBool,
  materialId: z.array(z.string()).optional(),
  qtySent: z.array(z.string()).optional(),
});

function parseMaterials(ids?: string[], qtys?: string[]) {
  const merged = new Map<string, number>();
  (ids ?? []).forEach((id, i) => {
    const q = round3(Number(qtys?.[i] ?? 0));
    if (/^[0-9a-f-]{36}$/i.test(id) && q > 0) merged.set(id, round3((merged.get(id) ?? 0) + q));
  });
  return [...merged.entries()].map(([materialId, qtySent]) => ({ materialId, qtySent }));
}

export async function createJobWork(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("jobwork");
    const parsed = parseForm(createSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    const mats = parseMaterials(d.materialId, d.qtySent);
    const id = await db.transaction(async (tx) => {
      const [vendor] = await tx.select({ name: contacts.name }).from(contacts).where(eq(contacts.id, d.vendorId)).limit(1);
      if (!vendor) throw new Error("Job worker not found");
      const number = await nextNumber(tx, "jobwork", d.workDate);
      const status: JobWorkStatus = d.sendNow ? "sent" : "draft";
      const [row] = await tx
        .insert(jobWorkOrders)
        .values({
          number,
          vendorId: d.vendorId,
          workDate: d.workDate,
          dueDate: d.dueDate,
          process: d.process ?? "Stitching",
          productId: d.productId ?? null,
          description: d.description ?? "",
          orderedQty: d.orderedQty,
          ratePerUnitP: d.ratePerUnitP,
          taxBps: Math.round((d.taxPct ?? 0) * 100),
          status,
          note: d.note ?? null,
          userId: user.id,
        })
        .returning({ id: jobWorkOrders.id });
      if (mats.length) await tx.insert(jobWorkMaterials).values(mats.map((m) => ({ orderId: row.id, ...m })));
      if (d.sendNow) {
        for (const m of mats) await adjustMaterial(tx, { materialId: m.materialId, kind: "jobwork_out", qty: -m.qtySent, refType: "jobwork", refId: number, note: `Sent to ${vendor.name} (${number})`, userId: user.id });
      }
      await audit(tx, { userId: user.id, action: "create", entityType: "jobwork", entityId: row.id, summary: `${number} to ${vendor.name}: ${d.orderedQty} × ${d.process ?? "Stitching"}` });
      return row.id;
    });
    revalidateJobWork(id);
    return { ok: true, message: "Job work order created", id };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const updateSchema = headerSchema.extend({ id: zUuid("order") });

export async function updateJobWork(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("jobwork");
    const parsed = parseForm(updateSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    const [existing] = await db.select().from(jobWorkOrders).where(eq(jobWorkOrders.id, d.id)).limit(1);
    if (!existing) return { error: "Order not found" };
    if (existing.status === "closed" || existing.status === "cancelled") return { error: "Closed orders cannot be edited" };
    await db.transaction(async (tx) => {
      await tx
        .update(jobWorkOrders)
        .set({ vendorId: d.vendorId, workDate: d.workDate, dueDate: d.dueDate, process: d.process ?? "Stitching", productId: d.productId ?? null, description: d.description ?? "", orderedQty: d.orderedQty, ratePerUnitP: d.ratePerUnitP, taxBps: Math.round((d.taxPct ?? 0) * 100), note: d.note ?? null })
        .where(eq(jobWorkOrders.id, d.id));
      await audit(tx, { userId: user.id, action: "update", entityType: "jobwork", entityId: d.id, summary: `Edited ${existing.number}` });
    });
    revalidateJobWork(d.id);
    return { ok: true, message: "Order updated" };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const sendSchema = z.object({ id: zUuid("order"), materialId: z.array(z.string()).optional(), qtySent: z.array(z.string()).optional() });

/** Move a draft to sent; also lets you add materials being sent along. */
export async function sendJobWork(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("jobwork");
    const parsed = parseForm(sendSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    const extra = parseMaterials(d.materialId, d.qtySent);
    await db.transaction(async (tx) => {
      const [o] = await tx.select().from(jobWorkOrders).where(eq(jobWorkOrders.id, d.id)).for("update");
      if (!o) throw new Error("Order not found");
      const [vendor] = await tx.select({ name: contacts.name }).from(contacts).where(eq(contacts.id, o.vendorId)).limit(1);
      const lines = o.status === "draft" ? await tx.select().from(jobWorkMaterials).where(eq(jobWorkMaterials.orderId, d.id)) : [];
      for (const l of lines) await adjustMaterial(tx, { materialId: l.materialId, kind: "jobwork_out", qty: -l.qtySent, refType: "jobwork", refId: o.number, note: `Sent to ${vendor?.name ?? "job worker"} (${o.number})`, userId: user.id });
      for (const m of extra) {
        const [existing] = await tx.select().from(jobWorkMaterials).where(and(eq(jobWorkMaterials.orderId, d.id), eq(jobWorkMaterials.materialId, m.materialId))).limit(1);
        if (existing) await tx.update(jobWorkMaterials).set({ qtySent: round3(existing.qtySent + m.qtySent) }).where(eq(jobWorkMaterials.id, existing.id));
        else await tx.insert(jobWorkMaterials).values({ orderId: d.id, ...m });
        await adjustMaterial(tx, { materialId: m.materialId, kind: "jobwork_out", qty: -m.qtySent, refType: "jobwork", refId: o.number, note: `Sent to ${vendor?.name ?? "job worker"} (${o.number})`, userId: user.id });
      }
      if (o.status === "draft") await tx.update(jobWorkOrders).set({ status: "sent" }).where(eq(jobWorkOrders.id, d.id));
      await audit(tx, { userId: user.id, action: "send", entityType: "jobwork", entityId: d.id, summary: `${o.number} materials sent` });
    });
    revalidateJobWork(d.id);
    return { ok: true, message: "Materials sent and deducted from the store" };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const receiveSchema = z.object({ id: zUuid("order"), receiptDate: zDate, acceptedQty: zInt("Accepted quantity", 0), rejectedQty: zInt("Rejected quantity", 0).optional(), note: zOptional(500) });

export async function receiveJobWork(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("jobwork");
    const parsed = parseForm(receiveSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    const rejected = d.rejectedQty ?? 0;
    if (d.acceptedQty + rejected <= 0) return { error: "Enter the accepted or rejected quantity" };
    const msg = await db.transaction(async (tx) => {
      const [o] = await tx.select().from(jobWorkOrders).where(eq(jobWorkOrders.id, d.id)).for("update");
      if (!o) throw new Error("Order not found");
      if (o.status === "cancelled" || o.status === "closed") throw new Error("This order is closed");
      await tx.insert(jobWorkReceipts).values({ orderId: d.id, receiptDate: d.receiptDate, acceptedQty: d.acceptedQty, rejectedQty: rejected, note: d.note ?? null, userId: user.id });
      const receivedQty = o.receivedQty + d.acceptedQty;
      const rejectedQty = o.rejectedQty + rejected;
      const status: JobWorkStatus = o.orderedQty > 0 && receivedQty + rejectedQty >= o.orderedQty ? "received" : "partial";
      await tx.update(jobWorkOrders).set({ receivedQty, rejectedQty, status }).where(eq(jobWorkOrders.id, d.id));
      if (o.productId && d.acceptedQty > 0) {
        const [p] = await tx.select({ name: products.name }).from(products).where(eq(products.id, o.productId)).limit(1);
        await adjustStock(tx, { productId: o.productId, kind: "jobwork_in", qty: d.acceptedQty, refType: "jobwork", refId: o.number, note: `Received from job work ${o.number}`, userId: user.id });
        await audit(tx, { userId: user.id, action: "receive", entityType: "jobwork", entityId: d.id, summary: `${o.number}: received ${d.acceptedQty} × ${p?.name ?? "product"}${rejected ? `, ${rejected} rejected` : ""}` });
        return `${d.acceptedQty} pieces added to finished stock`;
      }
      await audit(tx, { userId: user.id, action: "receive", entityType: "jobwork", entityId: d.id, summary: `${o.number}: received ${d.acceptedQty}${rejected ? `, ${rejected} rejected` : ""}` });
      return "Receipt recorded";
    });
    revalidateJobWork(d.id);
    return { ok: true, message: msg };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const returnSchema = z.object({ id: zUuid("order"), materialId: zUuid("material"), qty: zNumber("Quantity"), note: zOptional(300) });

export async function returnJobWorkMaterial(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("jobwork");
    const parsed = parseForm(returnSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    if (d.qty <= 0) return { error: "Quantity must be greater than zero" };
    await db.transaction(async (tx) => {
      const [o] = await tx.select().from(jobWorkOrders).where(eq(jobWorkOrders.id, d.id)).limit(1);
      if (!o) throw new Error("Order not found");
      const [line] = await tx.select().from(jobWorkMaterials).where(and(eq(jobWorkMaterials.orderId, d.id), eq(jobWorkMaterials.materialId, d.materialId))).limit(1);
      if (!line) throw new Error("That material was not sent with this order");
      await tx.update(jobWorkMaterials).set({ qtyReturned: round3(line.qtyReturned + d.qty) }).where(eq(jobWorkMaterials.id, line.id));
      const [m] = await tx.select({ name: materials.name }).from(materials).where(eq(materials.id, d.materialId)).limit(1);
      await adjustMaterial(tx, { materialId: d.materialId, kind: "jobwork_in", qty: d.qty, refType: "jobwork", refId: o.number, note: d.note ?? `Returned from ${o.number}`, userId: user.id });
      await audit(tx, { userId: user.id, action: "return_material", entityType: "jobwork", entityId: d.id, summary: `${o.number}: ${d.qty} ${m?.name ?? ""} returned` });
    });
    revalidateJobWork(d.id);
    return { ok: true, message: "Material returned to the store" };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const billSchema = z.object({ id: zUuid("order"), workDate: zDate, amountP: zOptionalMoney, reference: zOptional(100), paymentMethod: zOptional(20), note: zOptional(500) });

export async function billJobWork(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("jobwork");
    const parsed = parseForm(billSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    const amount = await db.transaction(async (tx) => {
      const [o] = await tx.select().from(jobWorkOrders).where(eq(jobWorkOrders.id, d.id)).for("update");
      if (!o) throw new Error("Order not found");
      if (o.billedAt) throw new Error("A bill has already been recorded for this order");
      const computed = Math.round(o.receivedQty * o.ratePerUnitP * (1 + o.taxBps / 10000));
      const amountP = d.amountP || computed;
      if (amountP <= 0) throw new Error("Enter the bill amount (no rate was set on the order)");
      const [vendor] = await tx.select({ name: contacts.name }).from(contacts).where(eq(contacts.id, o.vendorId)).limit(1);
      const number = await nextNumber(tx, "expense", d.workDate);
      const [rec] = await tx
        .insert(businessRecords)
        .values({
          number,
          entityId: o.entityId,
          kind: "expense",
          workDate: d.workDate,
          amountP,
          category: "Job work",
          reference: d.reference ?? o.number,
          contactId: o.vendorId,
          paymentMethod: (d.paymentMethod as "cash") || "credit",
          paymentTerms: !d.paymentMethod || d.paymentMethod === "credit" ? "credit" : "paid",
          taxableP: o.taxBps ? Math.round(amountP / (1 + o.taxBps / 10000)) : null,
          gstP: o.taxBps ? amountP - Math.round(amountP / (1 + o.taxBps / 10000)) : null,
          source: "jobwork",
          sourceRef: `jobwork:${o.id}`,
          note: `${vendor?.name ?? "Job worker"} · ${o.number} · ${o.receivedQty} × ${o.process}${d.note ? ` · ${d.note}` : ""}`,
          userId: user.id,
        })
        .returning({ id: businessRecords.id });
      await tx.update(jobWorkOrders).set({ billedAt: new Date(), billRecordId: rec.id, status: o.status === "received" ? "closed" : o.status }).where(eq(jobWorkOrders.id, d.id));
      await audit(tx, { userId: user.id, action: "bill", entityType: "jobwork", entityId: d.id, summary: `${o.number} billed ${formatINR(amountP)} (${number})` });
      return amountP;
    });
    revalidateJobWork(d.id);
    return { ok: true, message: `Bill of ${formatINR(amount)} recorded in the factory books` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const statusSchema = z.object({ id: zUuid("order"), status: zEnum(["closed", "cancelled", "sent"], "status"), reason: zOptional(300) });

export async function setJobWorkStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("jobwork");
    const parsed = parseForm(statusSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    await db.transaction(async (tx) => {
      const [o] = await tx.select().from(jobWorkOrders).where(eq(jobWorkOrders.id, d.id)).for("update");
      if (!o) throw new Error("Order not found");
      if (d.status === "sent" && o.status !== "draft") throw new Error("Only drafts can be sent");
      await tx.update(jobWorkOrders).set({ status: d.status, note: d.reason ? `${o.note ? o.note + "\n" : ""}${d.status}: ${d.reason}` : o.note }).where(eq(jobWorkOrders.id, d.id));
      await audit(tx, { userId: user.id, action: d.status, entityType: "jobwork", entityId: d.id, summary: `${o.number} ${d.status}${d.reason ? `: ${d.reason}` : ""}` });
    });
    revalidateJobWork(d.id);
    return { ok: true, message: `Order ${d.status}` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}
