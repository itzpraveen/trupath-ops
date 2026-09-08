"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { bankAccounts, businessRecords, contacts, payments, creditNotes, invoices } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireEditor } from "@/lib/auth";
import { errorMessage, parseForm, zBool, zDate, zEnum, zMoney, zOptional, zOptionalMoney, zOptionalUuid, zRequired, type ActionState } from "@/lib/forms";
import { formatINR } from "@/lib/money";
import { nextNumber } from "@/lib/numbering";
import { entityExists } from "@/lib/queries/common";

function revalidateMoney() {
  for (const p of ["/payments", "/sales", "/contacts", "/reports", "/"]) revalidatePath(p);
}

const paymentSchema = z.object({
  entityId: zRequired("Books", 40),
  direction: zEnum(["in", "out"], "direction"),
  workDate: zDate,
  amountP: zMoney("Amount"),
  contactId: zOptionalUuid,
  bankAccountId: zOptionalUuid,
  method: zEnum(["cash", "upi", "bank", "card", "cod", "gateway", "other"], "method"),
  reference: zOptional(100),
  recordId: zOptionalUuid,
  note: zOptional(500),
});

export async function createPayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("payments");
    const parsed = parseForm(paymentSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    if (!(await entityExists(d.entityId))) return { error: "Choose which books this belongs to", fieldErrors: { entityId: ["Unknown books"] } };
    const id = await db.transaction(async (tx) => {
      if (d.bankAccountId) {
        const [account] = await tx.select().from(bankAccounts).where(eq(bankAccounts.id, d.bankAccountId)).for("update");
        if (!account?.active || account.entityId !== d.entityId) throw new Error("Choose an active cash or bank account belonging to these books");
      }
      if (d.contactId) {
        const [contact] = await tx.select().from(contacts).where(eq(contacts.id, d.contactId));
        if (!contact?.active) throw new Error("Choose an active customer or supplier");
      }
      if (d.recordId) {
        const [record] = await tx.select().from(businessRecords).where(eq(businessRecords.id, d.recordId)).for("update");
        if (!record || record.voidedAt || record.entityId !== d.entityId || record.contactId !== (d.contactId ?? null) || record.paymentTerms !== "credit" || (d.direction === "in" ? record.kind !== "sale" : !["expense", "purchase", "return"].includes(record.kind))) throw new Error("Choose an unpaid bill for this contact in these books");
        const [paid] = await tx.select({ total: sql<number>`coalesce(sum(${payments.amountP}), 0)::float8` }).from(payments).where(and(eq(payments.recordId, record.id), isNull(payments.voidedAt)));
        const [credited] = await tx.select({ total: sql<number>`coalesce(sum(${creditNotes.totalP}),0)::float8` }).from(creditNotes).innerJoin(invoices, eq(invoices.id,creditNotes.invoiceId)).where(eq(invoices.recordId,record.id));
        if (d.amountP > record.amountP - Number(paid.total) - (record.kind === "sale" ? Number(credited.total) : 0)) throw new Error("This payment exceeds the unpaid amount on the selected bill");
      }

      const number = await nextNumber(tx, d.direction === "in" ? "receipt" : "payment", d.workDate);
      const [row] = await tx
        .insert(payments)
        .values({ number, entityId: d.entityId, direction: d.direction, workDate: d.workDate, amountP: d.amountP, contactId: d.contactId ?? null, bankAccountId: d.bankAccountId ?? null, method: d.method, reference: d.reference ?? "", recordId: d.recordId ?? null, note: d.note ?? null, userId: user.id })
        .returning({ id: payments.id });
      await audit(tx, { userId: user.id, action: "create", entityType: "payment", entityId: row.id, summary: `${number}: ${d.direction === "in" ? "received" : "paid"} ${formatINR(d.amountP)}` });
      return row.id;
    });
    revalidateMoney();
    return { ok: true, message: d.direction === "in" ? "Receipt recorded" : "Payment recorded", id };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const voidSchema = z.object({ id: zRequired("Payment"), reason: zRequired("Reason", 300) });

export async function voidPayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("payments");
    const parsed = parseForm(voidSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const [p] = await db.select().from(payments).where(eq(payments.id, parsed.data.id)).limit(1);
    if (!p) return { error: "Payment not found" };
    if (p.voidedAt) return { error: "Already voided" };
    await db.update(payments).set({ voidedAt: new Date(), voidReason: parsed.data.reason }).where(eq(payments.id, p.id));
    await audit(db, { userId: user.id, action: "void", entityType: "payment", entityId: p.id, summary: `Voided ${p.number}: ${parsed.data.reason}` });
    revalidateMoney();
    return { ok: true, message: "Payment voided" };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const accountSchema = z.object({
  id: zOptionalUuid,
  entityId: zRequired("Books", 40),
  name: zRequired("Name", 80),
  type: zEnum(["cash", "bank", "upi", "wallet"], "type"),
  openingP: zOptionalMoney,
  active: zBool,
});

export async function saveBankAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("payments");
    const parsed = parseForm(accountSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    if (!(await entityExists(d.entityId))) return { error: "Choose which books this belongs to", fieldErrors: { entityId: ["Unknown books"] } };
    await db.transaction(async (tx) => {
      if (d.id) {
        const [existing] = await tx.select().from(bankAccounts).where(eq(bankAccounts.id, d.id)).for("update");
        if (!existing) throw new Error("Account not found");
        if (existing.entityId !== d.entityId) throw new Error("An account cannot be moved between books. Create a separate account instead.");
        await tx.update(bankAccounts).set({ name: d.name, type: d.type, openingP: d.openingP, active: d.active }).where(eq(bankAccounts.id, d.id));
      } else await tx.insert(bankAccounts).values({ entityId: d.entityId, name: d.name, type: d.type, openingP: d.openingP });
      await audit(tx, { userId: user.id, action: d.id ? "update" : "create", entityType: "bank_account", entityId: d.id ?? null, summary: `${d.id ? "Updated" : "Added"} account ${d.name}` });
    });
    revalidateMoney();
    return { ok: true, message: "Account saved" };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}
