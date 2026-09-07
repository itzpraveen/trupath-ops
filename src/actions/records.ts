"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { businessRecords, type RecordKind } from "@/db/schema";
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
    const id = await db.transaction(async (tx) => {
      const number = await nextNumber(tx, d.kind, d.workDate);
      const [row] = await tx
        .insert(businessRecords)
        .values({
          number,
          kind: d.kind,
          entityId: d.entityId,
          workDate: d.workDate,
          amountP: d.amountP,
          channel: d.channel ?? (d.kind === "sale" || d.kind === "return" ? "Offline / direct" : ""),
          category: d.category ?? "",
          reference: d.reference ?? "",
          contactId: d.contactId ?? null,
          paymentMethod: d.paymentMethod,
          bankAccountId: d.bankAccountId ?? null,
          paymentTerms: d.paymentMethod === "credit" ? "credit" : "paid",
          taxableP: d.taxableP || null,
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
    await db.transaction(async (tx) => {
      await tx
        .update(businessRecords)
        .set({
          workDate: d.workDate,
          amountP: d.amountP,
          channel: d.channel ?? existing.channel,
          category: d.category ?? "",
          reference: d.reference ?? "",
          contactId: d.contactId ?? null,
          paymentMethod: d.paymentMethod,
          bankAccountId: d.bankAccountId ?? null,
          paymentTerms: d.paymentMethod === "credit" ? "credit" : "paid",
          taxableP: d.taxableP || null,
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
    await db.transaction(async (tx) => {
      await tx.update(businessRecords).set({ voidedAt: new Date(), voidedBy: user.id, voidReason: reason }).where(eq(businessRecords.id, id));
      await audit(tx, { userId: user.id, action: "void", entityType: "record", entityId: id, summary: `Voided ${existing.number ?? existing.kind} ${formatINR(existing.amountP)}: ${reason}` });
    });
    revalidate();
    return { ok: true, message: "Record voided" };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}
