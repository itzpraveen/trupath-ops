"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { bankAccounts, brands, businessRecords, invoices, payments, type RecordKind } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireEditor } from "@/lib/auth";
import { errorMessage, parseForm, zDate, zEnum, zMoney, zOptional, zOptionalMoney, zOptionalUuid, zRequired, type ActionState } from "@/lib/forms";
import { formatINR } from "@/lib/money";
import { nextNumber } from "@/lib/numbering";
import { entityExists } from "@/lib/queries/common";

const KINDS = ["sale", "expense", "return", "purchase"] as const;
const METHODS = ["cash", "upi", "bank", "card", "cod", "gateway", "credit", "other"] as const;
const KIND_LABEL: Record<RecordKind, string> = { sale: "Sale", expense: "Expense", return: "Return", purchase: "Purchase" };

const recordSchema = z.object({
  kind: zEnum(KINDS, "type"),
  brandId: zOptional(40),
  entityId: zRequired("Books", 40),
  workDate: zDate,
  amountP: zMoney("Amount"),
  channel: zOptional(100),
  category: zOptional(100),
  reference: zOptional(200),
  contactId: zOptionalUuid,
  paymentMethod: zEnum(METHODS, "payment method"),
  bankAccountId: zOptionalUuid,
  taxableP: zOptionalMoney,
  gstP: zOptionalMoney,
  note: zOptional(2000),
});

function revalidate() {
  revalidatePath("/sales");
  revalidatePath("/payments");
  revalidatePath("/reports");
  revalidatePath("/");
}

export async function createRecord(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("sales");
    const parsed = parseForm(recordSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    if (!(await entityExists(d.entityId))) return { error: "Choose which books this belongs to", fieldErrors: { entityId: ["Unknown books"] } };
    if (d.gstP >= d.amountP) return { error: "GST must be less than the amount", fieldErrors: { gstP: ["Must be less than the amount"] } };
    const id = await db.transaction(async (tx) => {
      if (d.brandId && !(await tx.select({id:brands.id}).from(brands).where(and(eq(brands.id,d.brandId),eq(brands.active,true))))[0]) throw new Error("Choose an active brand or Shared / unassigned");
      if (d.bankAccountId) {
        const [account] = await tx.select().from(bankAccounts).where(eq(bankAccounts.id, d.bankAccountId)).for("update");
        if (!account?.active || account.entityId !== d.entityId) throw new Error("Choose an active account belonging to these books");
      }
      const number = await nextNumber(tx, d.kind, d.workDate);
      const [row] = await tx
        .insert(businessRecords)
        .values({
          number,
          kind: d.kind,
          entityId: d.entityId,
          workDate: d.workDate,
          brandId: d.brandId ?? null,
          amountP: d.amountP,
          channel: d.channel ?? (d.kind === "sale" || d.kind === "return" ? "Offline / direct" : ""),
          category: d.category ?? "",
          reference: d.reference ?? "",
          contactId: d.contactId ?? null,
          paymentMethod: d.paymentMethod,
          bankAccountId: d.bankAccountId ?? null,
          paymentTerms: ["credit", "cod"].includes(d.paymentMethod) ? "credit" : "paid",
          taxableP: d.gstP ? d.taxableP || d.amountP - d.gstP : null,
          gstP: d.gstP || null,
          note: d.note ?? null,
          userId: user.id,
        })
        .returning({ id: businessRecords.id });
      await audit(tx, { userId: user.id, action: "create", entityType: "record", entityId: row.id, summary: `${KIND_LABEL[d.kind]} ${number} ${formatINR(d.amountP)}` });
      return row.id;
    });
    revalidate();
    return { ok: true, message: `${KIND_LABEL[d.kind]} recorded`, id };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const updateSchema = recordSchema.omit({ kind: true, entityId: true }).extend({ id: zRequired("Record") });

export async function updateRecord(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("sales");
    const parsed = parseForm(updateSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    const [existing] = await db.select().from(businessRecords).where(eq(businessRecords.id, d.id)).limit(1);
    if (!existing) return { error: "Record not found" };
    if (existing.voidedAt) return { error: "This record was voided and cannot be edited" };
    if (existing.source !== "manual") return { error: "Synced records are managed by the source system. Void it instead." };
    if (d.gstP >= d.amountP) return { error: "GST must be less than the amount", fieldErrors: { gstP: ["Must be less than the amount"] } };
    await db.transaction(async (tx) => {
      await tx.select({ id: businessRecords.id }).from(businessRecords).where(eq(businessRecords.id, d.id)).for("update");
      const [invoice] = await tx.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.recordId, d.id), isNull(invoices.voidedAt)));
      const [payment] = await tx.select({ id: payments.id }).from(payments).where(and(eq(payments.recordId, d.id), isNull(payments.voidedAt)));
      if (invoice || payment) throw new Error("This entry has an issued invoice or allocated payment. Accounts must review it before editing.");
      if (d.brandId && !(await tx.select({id:brands.id}).from(brands).where(and(eq(brands.id,d.brandId),eq(brands.active,true))))[0]) throw new Error("Choose an active brand or Shared / unassigned");
      if (d.bankAccountId) {
        const [account] = await tx.select().from(bankAccounts).where(eq(bankAccounts.id, d.bankAccountId));
        if (!account?.active || account.entityId !== existing.entityId) throw new Error("Choose an active account belonging to these books");
      }
      await tx
        .update(businessRecords)
        .set({
          workDate: d.workDate,
          brandId: d.brandId ?? null,
          amountP: d.amountP,
          channel: d.channel ?? existing.channel,
          category: d.category ?? "",
          reference: d.reference ?? "",
          contactId: d.contactId ?? null,
          paymentMethod: d.paymentMethod,
          bankAccountId: d.bankAccountId ?? null,
          paymentTerms: ["credit", "cod"].includes(d.paymentMethod) ? "credit" : "paid",
          taxableP: d.gstP ? d.taxableP || d.amountP - d.gstP : null,
          gstP: d.gstP || null,
          note: d.note ?? null,
        })
        .where(eq(businessRecords.id, d.id));
      await audit(tx, { userId: user.id, action: "update", entityType: "record", entityId: d.id, summary: `Edited ${existing.number ?? existing.kind} (${formatINR(existing.amountP)} → ${formatINR(d.amountP)})` });
    });
    revalidate();
    return { ok: true, message: "Record updated" };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const voidSchema = z.object({ id: zRequired("Record"), reason: zRequired("Reason", 500) });

export async function voidRecord(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("sales");
    const parsed = parseForm(voidSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const { id, reason } = parsed.data;
    const [existing] = await db.select().from(businessRecords).where(and(eq(businessRecords.id, id))).limit(1);
    if (!existing) return { error: "Record not found" };
    if (existing.voidedAt) return { error: "Already voided" };
    if (existing.source === "shopify" || existing.source === "dispatch") return { error: "Cancel or return the sale from its order or dispatch so the invoice and stock stay consistent." };
    await db.transaction(async (tx) => {
      await tx.select({ id: businessRecords.id }).from(businessRecords).where(eq(businessRecords.id, id)).for("update");
      const [invoice] = await tx.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.recordId, id), isNull(invoices.voidedAt)));
      const [payment] = await tx.select({ id: payments.id }).from(payments).where(and(eq(payments.recordId, id), isNull(payments.voidedAt)));
      if (invoice || payment) throw new Error("This entry has an issued invoice or allocated payment. Accounts must review it before voiding.");
      await tx.update(businessRecords).set({ voidedAt: new Date(), voidedBy: user.id, voidReason: reason }).where(eq(businessRecords.id, id));
      await audit(tx, { userId: user.id, action: "void", entityType: "record", entityId: id, summary: `Voided ${existing.number ?? existing.kind} ${formatINR(existing.amountP)}: ${reason}` });
    });
    revalidate();
    return { ok: true, message: "Record voided" };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}
