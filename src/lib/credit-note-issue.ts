import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { businessRecords, creditNotes, dispatches, entities, invoices } from "@/db/schema";
import { computeCreditNote, type ReturnSelection } from "@/lib/credit-note";
import { todayIST, fyRange } from "@/lib/dates";
import { nextInvoiceNumber } from "@/lib/numbering";
import { adjustStock } from "@/lib/stock";
import { audit } from "@/lib/audit";

export async function issueCreditNote(input: { invoiceId: string; requestId: string; reason: string; selections: ReturnSelection[]; userId: string; taxAdjustmentConfirmed: boolean; expectedCount: number }) {
  return db.transaction(async tx => {
    const [ref] = await tx.select().from(invoices).where(eq(invoices.id,input.invoiceId));
    if (!ref) throw new Error("Invoice not found");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ref.shopifyOrderId ? `order:${ref.shopifyOrderId}` : `dispatch:${ref.dispatchId}`}, 0))`);
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id,ref.id)).for("update");
    const [existing] = await tx.select().from(creditNotes).where(eq(creditNotes.requestId,input.requestId));
    if (existing) {
      if (existing.invoiceId !== inv.id) throw new Error("This return reference was already used for a different invoice");
      return { id: existing.id, number: existing.number, productIds: [] as string[] };
    }
    if (inv.voidedAt) throw new Error("A cancelled invoice cannot receive a credit note");
    // Shopify refund records and restocking currently belong to its sync process. Do not post a second return.
    if (inv.shopifyOrderId) throw new Error("Website returns still need the Shopify refund and credit note reconciled in your current accounting system. Automatic credit notes for these orders are not connected yet.");
    if (!input.reason.trim() || !input.taxAdjustmentConfirmed) throw new Error("Record the return reason and confirm GST adjustment eligibility with accounts");
    const today = todayIST();
    const deadline = `${fyRange(inv.issuedOn)[1].slice(0,4)}-11-30`;
    if (today < inv.issuedOn || today > deadline) throw new Error("This invoice is outside the supported GST credit-note date window. Accounts must handle a commercial adjustment in the current accounting system.");
    const [entity] = await tx.select().from(entities).where(eq(entities.id,inv.entityId));
    const registrations = inv.customerGstin ? await tx.select({status:entities.eInvoiceStatus}).from(entities).where(eq(entities.gstin,inv.sellerGstin)) : [];
    if (inv.customerGstin && registrations.some(r=>r.status!=="not_required")) throw new Error("This B2B credit note needs e-invoice review / IRP registration through the current accounting system");
    if (entity.gstin !== inv.sellerGstin) throw new Error("The books' GSTIN has changed. Accounts must resolve the original registration before issuing this credit note.");
    const [dsp] = inv.dispatchId ? await tx.select().from(dispatches).where(eq(dispatches.id,inv.dispatchId)).for("update") : [];
    if (!dsp?.shippedAt || !dsp.stockDeducted) throw new Error("Use this return flow for goods dispatched and received back. Unshipped sales should be cancelled and corrected.");
    const [sale] = inv.recordId ? await tx.select().from(businessRecords).where(and(eq(businessRecords.id,inv.recordId),isNull(businessRecords.voidedAt))).for("update") : [];
    if (!sale?.contactId) throw new Error("The original sale needs a linked customer before recording its credit");
    const previous = await tx.select().from(creditNotes).where(eq(creditNotes.invoiceId,inv.id));
    if (previous.length !== input.expectedCount) throw new Error("Another credit note was issued after this review. Reload the return and check the remaining quantities.");
    const totals = computeCreditNote(inv, previous, input.selections);
    const number = await nextInvoiceNumber(tx,inv.entityId,"CN",today);
    const [collision] = await tx.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.sellerGstin,inv.sellerGstin),eq(invoices.number,number)));
    if (collision) throw new Error("This number is already an invoice number. Correct the CN series in Settings.");
    const [record] = await tx.insert(businessRecords).values({ number, entityId: inv.entityId, brandId: dsp.brandId, kind: "return", workDate: today, amountP: totals.totalP, taxableP: totals.taxableP, gstP: totals.cgstP+totals.sgstP+totals.igstP, contactId: sale.contactId, paymentTerms: "credit", paymentMethod: "credit", source: "dispatch", sourceRef: `credit-note:${input.requestId}`, category: "Goods return", channel: sale.channel, reference: inv.number, note: input.reason, userId: input.userId }).returning();
    const [note] = await tx.insert(creditNotes).values({ invoiceId: inv.id, requestId: input.requestId, number, sellerGstin: inv.sellerGstin, issuedOn: today, reason: input.reason.trim(), ...totals, recordId: record.id, userId: input.userId }).returning();
    const productIds: string[] = [];
    // Stable product order also prevents deadlocks between simultaneous multi-product returns.
    for (const line of [...totals.lines].sort((a,b)=>(a.productId??"").localeCompare(b.productId??""))) {
      if (!line.restockQty) continue;
      if (!line.productId) throw new Error("This older invoice has no saved stock mapping. Accounts must reconcile its physical return separately.");
      await adjustStock(tx,{ productId: line.productId, kind: "return_in", qty: line.restockQty, refType: "credit_note", refId: note.id, note: `${number}: ${input.reason}`, userId: input.userId });
      productIds.push(line.productId);
    }
    if (inv.lines.every((l,i) => [...previous.flatMap(p=>p.lines),...totals.lines].filter(p=>p.originalLine===i).reduce((n,p)=>n+p.qty,0)===l.qty)) await tx.update(dispatches).set({status:"returned",stockDeducted:false}).where(eq(dispatches.id,dsp.id));
    await audit(tx,{ userId: input.userId, action:"create", entityType:"credit_note",entityId:note.id,summary:`${number} against ${inv.number}; goods received, saleable stock restored; accounts confirmed GST adjustment before annual return / statutory deadline. ${input.reason}` });
    return {id:note.id,number,productIds};
  });
}
