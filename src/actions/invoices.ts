"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { businessRecords, creditNotes, dispatches, invoices, shopifyOrders } from "@/db/schema";
import { audit } from "@/lib/audit";
import { AuthError, getCurrentUser, requireEditor } from "@/lib/auth";
import { errorMessage, parseForm, zEnum, zRequired, zUuid, type ActionState } from "@/lib/forms";
import { issueInvoice } from "@/lib/invoice-issue";
import { canEdit } from "@/lib/permissions";

/** Dispatch staff print the invoice for the parcel; accounts issue them for wholesale sales. */
async function requireInvoiceEditor() {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Your session has expired. Please sign in again.");
  if (!canEdit(user.role, "dispatch") && !canEdit(user.role, "sales")) throw new AuthError("You do not have permission to issue invoices.");
  return user;
}

function revalidateInvoice(r: { shopifyOrderId?: string | null; dispatchId?: string | null }) {
  for (const p of ["/sales", "/dispatch", "/orders", "/reports"]) revalidatePath(p);
  if (r.dispatchId) revalidatePath(`/dispatch/${r.dispatchId}`);
  if (r.shopifyOrderId) revalidatePath(`/orders/${r.shopifyOrderId}`);
}

const createSchema = z.object({ source: zEnum(["order", "dispatch"], "source"), id: zRequired("Reference", 60), fingerprint: z.string().regex(/^[a-f0-9]{64}$/, "Review the invoice before issuing it") });

export async function createInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireInvoiceEditor();
    const parsed = parseForm(createSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    const r = await issueInvoice({ source: d.source, id: d.id, userId: user.id, fingerprint: d.fingerprint });
    revalidateInvoice(d.source === "order" ? { shopifyOrderId: d.id } : { dispatchId: d.id });
    return { ok: true, message: r.created ? `Invoice ${r.number} created` : `Invoice ${r.number} already exists for this ${d.source}`, id: r.id };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const voidSchema = z.object({ id: zUuid("invoice"), reason: zRequired("Reason", 300) });

/** Cancel an invoice. Its number is never reused; a fresh invoice can be issued afterwards. */
export async function voidInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("sales");
    const parsed = parseForm(voidSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const inv = await db.transaction(async (tx) => {
      const [ref] = await tx.select().from(invoices).where(eq(invoices.id, parsed.data.id));
      if (!ref) throw new Error("Invoice not found");
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ref.shopifyOrderId ? `order:${ref.shopifyOrderId}` : `dispatch:${ref.dispatchId}`}, 0))`);
      const [invoice] = await tx.select().from(invoices).where(and(eq(invoices.id, ref.id), isNull(invoices.voidedAt))).for("update");
      if (!invoice) throw new Error("Invoice already cancelled");
      const [credit] = await tx.select({ id: creditNotes.id }).from(creditNotes).where(eq(creditNotes.invoiceId, invoice.id));
      if (credit) throw new Error("This invoice has a credit note and cannot be cancelled");
      const [dispatch] = invoice.dispatchId ? await tx.select().from(dispatches).where(eq(dispatches.id, invoice.dispatchId)) : [];
      const [order] = invoice.shopifyOrderId ? await tx.select().from(shopifyOrders).where(eq(shopifyOrders.id, invoice.shopifyOrderId)) : [];
      if (dispatch?.shippedAt || order?.lineItems.some((l) => (l.fulfilledQty ?? 0) > 0) || order?.fulfillmentStatus === "FULFILLED") throw new Error("This sale has shipped. Accounts must issue a credit note; its tax invoice cannot simply be cancelled.");
      await tx.update(invoices).set({ voidedAt: new Date(), voidReason: parsed.data.reason }).where(eq(invoices.id, invoice.id));
      if (invoice.recordId && !invoice.shopifyOrderId) await tx.update(businessRecords).set({ taxableP: null, gstP: null }).where(eq(businessRecords.id, invoice.recordId));
      await audit(tx, { userId: user.id, action: "void", entityType: "invoice", entityId: invoice.id, summary: `Cancelled invoice ${invoice.number}: ${parsed.data.reason}` });
      return invoice;
    });
    revalidateInvoice(inv);
    revalidatePath(`/print/invoice/${inv.id}`);
    return { ok: true, message: `Invoice ${inv.number} cancelled` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}
