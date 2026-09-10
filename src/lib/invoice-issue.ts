import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { businessRecords, contacts, dispatchItems, dispatches, entities, invoices, creditNotes, products, shopifyOrders, type InvoiceLineRow } from "@/db/schema";
import { audit } from "@/lib/audit";
import { todayIST } from "@/lib/dates";
import { stateCodeFor, stateName } from "@/lib/india";
import { computeInvoice, type InvoiceLineInput } from "@/lib/invoice";
import { nextInvoiceNumber, nextNumber } from "@/lib/numbering";
import { assertProductBillingReady, assertShopifyTaxMatches } from "@/lib/product-tax";

export type IssueResult = { id: string; number: string; created: boolean };

type Buyer = { name: string; address: string; phone: string | null; email: string | null; gstin: string | null; stateCode: string; destination: string | null };

/**
 * Issue a GST tax invoice for a website order or a dispatch. The invoice is a snapshot: names, prices and
 * addresses are copied in, and the number comes from the books' series (B2C, or B2B when the buyer has a GSTIN).
 * A second call for the same order or dispatch returns the existing live invoice instead of numbering another.
 */
export type InvoiceSource = { source: "order" | "dispatch"; id: string };

async function prepareInvoice(tx: Tx, input: InvoiceSource) {
    const [sourceDispatch] = input.source === "dispatch" ? await tx.select().from(dispatches).where(eq(dispatches.id, input.id)) : [];
    if (input.source === "dispatch" && !sourceDispatch) throw new Error("Dispatch not found");
    const orderId = input.source === "order" ? input.id : sourceDispatch?.shopifyOrderId;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${orderId ? `order:${orderId}` : `dispatch:${input.id}`}, 0))`);
    let dsp: typeof dispatches.$inferSelect | undefined;
    let order: typeof shopifyOrders.$inferSelect | undefined;
    if (input.source === "dispatch") {
      [dsp] = await tx.select().from(dispatches).where(eq(dispatches.id, input.id)).for("update");
      if (!dsp) throw new Error("Dispatch not found");
      if (["cancelled", "returned"].includes(dsp.status)) throw new Error("A cancelled or returned dispatch cannot be invoiced");
      if (dsp.shopifyOrderId) [order] = await tx.select().from(shopifyOrders).where(eq(shopifyOrders.id, dsp.shopifyOrderId)).for("update");
    } else {
      [order] = await tx.select().from(shopifyOrders).where(eq(shopifyOrders.id, input.id)).for("update");
      if (!order) throw new Error("Order not found");
      if (order.cancelledAt) throw new Error("This order was cancelled on Shopify");
      [dsp] = await tx.select().from(dispatches).where(eq(dispatches.shopifyOrderId, order.id)).limit(1);
    }

    const entityId = order?.entityId ?? dsp?.entityId ?? "brand";
    const [entity] = await tx.select().from(entities).where(eq(entities.id, entityId)).limit(1);
    if (!entity) throw new Error("Books not found");
    if (!entity.gstin || !entity.stateCode) throw new Error(`Add the GSTIN and state code for ${entity.name} under Settings → Company details before issuing invoices.`);

    const gstin = entity.gstin.trim().toUpperCase();
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin) || gstin.slice(0, 2) !== entity.stateCode || !stateName(entity.stateCode)) throw new Error("Check the seller GSTIN and state in Company details");
    if (!entity.legalName?.trim() || !entity.address?.trim()) throw new Error("Add the seller legal name and full registered address in Company details before issuing invoices");
    if (dsp && ["cancelled", "returned"].includes(dsp.status)) throw new Error("A cancelled or returned dispatch cannot be invoiced");
    if (order && (order.cancelledAt || order.currency !== "INR" || order.refundedP > 0 || ["REFUNDED", "PARTIALLY_REFUNDED", "VOIDED"].includes(order.financialStatus))) throw new Error("This order needs an accounts review before invoicing (currency, refund or cancellation). Use the original invoice and a credit note for refunds.");
    let buyer: Buyer;
    const lines: InvoiceLineInput[] = [];
    let totalP: number;
    let paymentTerms: string | null = null;

    if (order) {
      const a = order.billingAddress?.address1 ? order.billingAddress : (order.shippingAddress ?? {});
      const stateCode = stateCodeFor({ provinceCode: a.provinceCode, province: a.province });
      if (!stateCode) throw new Error(`Could not work out the buyer's state from "${a.province ?? "no state"}" on order ${order.name}.`);
      buyer = {
        name: a.name || order.customerName,
        address: [a.address1, a.address2, [a.city, a.zip].filter(Boolean).join(" "), a.province, a.country].filter(Boolean).join("\n"),
        phone: order.phone ?? a.phone ?? null,
        email: order.email,
        gstin: null,
        stateCode,
        destination: order.shippingAddress?.city ?? a.city ?? null,
      };
      const variantIds = order.lineItems.map((l) => l.variantId).filter((v): v is string => !!v);
      const prods = variantIds.length ? await tx.select({ id: products.id, name: products.name, variant: products.variant, requiresComponentBilling: products.requiresComponentBilling, shopifyVariantId: products.shopifyVariantId, hsnCode: products.hsnCode, gstRate: products.gstRate, unit: products.unit }).from(products).where(inArray(products.shopifyVariantId, variantIds)) : [];
      const byVariant = new Map(prods.map((p) => [p.shopifyVariantId!, p]));
      const missingRate: string[] = [];
      for (const l of order.lineItems) {
        const quantity = l.originalQuantity ?? l.quantity;
        if (quantity <= 0) continue;
        const p = l.variantId ? byVariant.get(l.variantId) : undefined;
        assertProductBillingReady({ name: l.title, variant: l.variantTitle });
        if (p) assertProductBillingReady(p);
        assertShopifyTaxMatches(l.title, p?.gstRate, l.taxLines ?? []);
        const gross = l.priceP * quantity - l.discountP;
        let ratePct: number;
        let taxP: number | undefined;
        if (l.taxLines?.length) {
          // exactly what Shopify charged: IGST 5%, or CGST 2.5% + SGST 2.5%
          ratePct = l.taxLines.reduce((s, t) => s + t.ratePct, 0);
          taxP = l.taxLines.reduce((s, t) => s + t.amountP, 0);
        } else if (p?.gstRate !== null && p?.gstRate !== undefined) {
          ratePct = Number(p.gstRate);
        } else {
          missingRate.push(l.title);
          continue;
        }
        const inclP = order.taxesIncluded ? gross : gross + (taxP ?? Math.round((gross * ratePct) / 100));
        lines.push({ productId: p?.id, description: l.variantTitle ? `${l.title} — ${l.variantTitle}` : l.title, hsn: p?.hsnCode ?? "", ratePct, qty: quantity, unit: (p?.unit ?? "pcs").toUpperCase(), inclP, taxP });
      }
      if (missingRate.length) throw new Error(`Set the GST rate for ${missingRate.join(", ")} under Products, or refresh the order from Shopify so its tax lines come through.`);
      if (order.shippingP > 0) {
        const lineTax = lines.reduce((s, l) => s + (l.taxP ?? Math.round(l.inclP - l.inclP / (1 + l.ratePct / 100))), 0);
        const shipTax = order.taxP - lineTax;
        if (shipTax < 0) throw new Error("Order tax is less than item tax. Refresh the order and ask accounts to reconcile it.");
        const inclP = order.taxesIncluded ? order.shippingP : order.shippingP + shipTax;
        const classifications = new Set(lines.map((l) => `${l.hsn}:${l.ratePct}`));
        let hsn: string, ratePct: number;
        if (entity.shippingTaxTreatment === "goods") {
          if (classifications.size !== 1) throw new Error("Shipping on items with different HSN codes or GST rates needs accounts to confirm its allocation. Use the existing invoicing system for this order.");
          hsn = lines[0].hsn; ratePct = lines[0].ratePct;
        } else {
          if (!entity.shippingHsn) throw new Error("Confirm the HSN / SAC for the separate shipping service in Company details.");
          hsn = entity.shippingHsn;
          ratePct = shipTax > 0 && inclP > shipTax ? Math.round((shipTax / (inclP - shipTax)) * 10000) / 100 : 0;
        }
        lines.push({ description: "Shipping charges", hsn, ratePct, qty: 1, unit: "", inclP, taxP: shipTax });
      }
      totalP = order.totalP;
      paymentTerms = order.financialStatus === "PAID" ? "Paid" : /cod|cash|delivery/i.test(order.gateway ?? "") ? "Cash on delivery - unpaid" : "Unpaid";
    } else {
      const contact = dsp!.contactId ? (await tx.select().from(contacts).where(eq(contacts.id, dsp!.contactId)).limit(1))[0] : undefined;
      if (!contact?.stateCode) throw new Error("Choose a saved customer with a state code on this dispatch (Customers & vendors) so the invoice shows the place of supply.");
      buyer = { name: dsp!.customerName || contact.name, address: dsp!.address ?? contact.address ?? "", phone: dsp!.phone ?? contact.phone, email: contact.email, gstin: contact.gstin, stateCode: contact.stateCode, destination: null };
      const items = await tx
        .select({ productId: products.id, qty: dispatchItems.qty, unitPriceP: dispatchItems.unitPriceP, name: products.name, variant: products.variant, requiresComponentBilling: products.requiresComponentBilling, hsnCode: products.hsnCode, gstRate: products.gstRate, priceP: products.priceP, unit: products.unit })
        .from(dispatchItems)
        .innerJoin(products, eq(products.id, dispatchItems.productId))
        .where(eq(dispatchItems.dispatchId, dsp!.id));
      if (!items.length) throw new Error("This dispatch has no items");
      for (const item of items) assertProductBillingReady(item);
      const missing = [...new Set(items.filter((i) => i.gstRate === null || i.gstRate === undefined).map((i) => i.name))];
      if (missing.length) throw new Error(`Set the GST rate (and HSN code) for ${missing.join(", ")} under Products first.`);
      if (items.some((i) => i.unitPriceP === null)) throw new Error("Edit this dispatch and confirm the selling price for each item before invoicing");
      totalP = items.reduce((sum, i) => sum + i.unitPriceP! * i.qty, 0);
      if (dsp!.amountP !== totalP) throw new Error("Item selling prices do not match the dispatch value. Edit the dispatch to confirm the agreed prices.");
      for (const i of items) lines.push({ productId: i.productId, description: i.variant ? `${i.name} - ${i.variant}` : i.name, hsn: i.hsnCode ?? "", ratePct: Number(i.gstRate), qty: i.qty, unit: i.unit.toUpperCase(), inclP: i.unitPriceP! * i.qty });

    }

    if (!buyer.name.trim() || !buyer.address.trim() || !stateName(buyer.stateCode)) throw new Error("Add the buyer name, full address and state before invoicing");
    if (buyer.gstin && (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(buyer.gstin) || buyer.gstin.slice(0, 2) !== buyer.stateCode)) throw new Error("Check the customer GSTIN and state in Customers & vendors");
    const shipping = order?.shippingAddress;
    const supplyStateCode = shipping?.address1 ? stateCodeFor({ provinceCode: shipping.provinceCode, province: shipping.province }) : buyer.stateCode;
    if (!supplyStateCode) throw new Error("Check the delivery state on the order before invoicing");
    const deliveryAddress = shipping?.address1 ? [shipping.name, shipping.address1, shipping.address2, [shipping.city, shipping.zip].filter(Boolean).join(" "), shipping.province, shipping.country].filter(Boolean).join("\n") : buyer.address;
    const inv = computeInvoice({ sellerStateCode: entity.stateCode, buyerStateCode: supplyStateCode, lines, totalP });
    const sourceRef = order ? `shopify:order:${order.id}:sale` : `dispatch:${dsp!.id}`;
    const [rec] = await tx.select().from(businessRecords).where(eq(businessRecords.sourceRef, sourceRef)).for("update");
    if (rec?.voidedAt) throw new Error("The linked sale was voided. Accounts must review it before issuing an invoice.");
    if (!order) paymentTerms = rec?.paymentTerms === "paid" ? "Paid" : "Credit";
    return {
      prefix: buyer.gstin ? "B2B" : entity.invoicePrefix,
      sourceRef, rec, brandId: order?.brandId ?? dsp?.brandId, eInvoiceStatus: entity.eInvoiceStatus,
      values: {
        entityId: entity.id,
        sellerGstin: gstin,
        seller: { legalName: entity.legalName, gstin, address: entity.address, stateCode: entity.stateCode, phone: entity.phone, email: entity.email },
        issuedOn: todayIST(),
        customerName: buyer.name, customerAddress: buyer.address, customerPhone: buyer.phone, customerEmail: buyer.email, customerGstin: buyer.gstin, customerStateCode: buyer.stateCode, supplyStateCode, deliveryAddress,
        lines: inv.lines as InvoiceLineRow[], taxableP: inv.taxableP, cgstP: inv.cgstP, sgstP: inv.sgstP, igstP: inv.igstP, roundOffP: inv.roundOffP, totalP: inv.totalP,
        orderRef: order?.name ?? dsp?.orderRef ?? null, dispatchNumber: dsp?.number ?? null, courier: dsp?.courier ?? null, trackingNo: dsp?.trackingNo ?? null,
        destination: buyer.destination, paymentTerms, shopifyOrderId: order?.id ?? null, dispatchId: dsp?.id ?? null, recordId: rec?.id ?? null,
      },
      contactId: dsp?.contactId ?? null,
    };
}

export async function previewInvoice(input: InvoiceSource) {
  return db.transaction(async (tx) => (await prepareInvoice(tx, input)).values);
}

export function invoiceFingerprint(value: Awaited<ReturnType<typeof previewInvoice>>) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export async function issueInvoice(input: InvoiceSource & { userId: string; fingerprint?: string }): Promise<IssueResult> {
  return db.transaction(async (tx) => {
    // Return the immutable issued document before consulting today's product tax setup.
    const [linkedDispatch] = input.source === "dispatch" ? await tx.select({ shopifyOrderId: dispatches.shopifyOrderId }).from(dispatches).where(eq(dispatches.id, input.id)) : [];
    const orderId = input.source === "order" ? input.id : linkedDispatch?.shopifyOrderId;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${orderId ? `order:${orderId}` : `dispatch:${input.id}`}, 0))`);
    const [issued] = await tx.select({ id: invoices.id, number: invoices.number }).from(invoices)
      .where(and(isNull(invoices.voidedAt), orderId ? eq(invoices.shopifyOrderId, orderId) : eq(invoices.dispatchId, input.id)));
    if (issued) return { ...issued, created: false };
    const draft = await prepareInvoice(tx, input);
    const v = draft.values;
    if (input.fingerprint && input.fingerprint !== invoiceFingerprint(v)) throw new Error("The sale changed after this preview. Reload and review the invoice again before issuing it.");
    const [existing] = await tx.select({ id: invoices.id, number: invoices.number }).from(invoices)
      .where(and(isNull(invoices.voidedAt), v.shopifyOrderId ? eq(invoices.shopifyOrderId, v.shopifyOrderId) : eq(invoices.dispatchId, v.dispatchId!)));
    if (existing) return { ...existing, created: false };
    const registrations = v.customerGstin ? await tx.select({status:entities.eInvoiceStatus}).from(entities).where(eq(entities.gstin,v.sellerGstin)) : [];
    const eInvoiceStatus = registrations.some(r=>r.status==="required") ? "required" : registrations.every(r=>r.status==="not_required") ? "not_required" : "unconfirmed";
    if (v.customerGstin && eInvoiceStatus !== "not_required") throw new Error(eInvoiceStatus === "required" ? "This B2B invoice needs an IRN and signed QR code. IRP integration is not connected; issue it through your current e-invoice system." : "Confirm e-invoice applicability with accounts in Company details before issuing B2B invoices.");
    const number = await nextInvoiceNumber(tx, v.entityId, draft.prefix, v.issuedOn);
    const [creditNumber] = await tx.select({ id: creditNotes.id }).from(creditNotes).where(and(eq(creditNotes.sellerGstin,v.sellerGstin),eq(creditNotes.number,number)));
    if (creditNumber) throw new Error("This number is already a credit note number. Choose a separate invoice prefix in Settings.");
    let recordId = v.recordId;
    // The invoice and its accounting entry commit together. Website tax remains reported from Shopify;
    // posting it here as well would count the tax twice in the current GST summary.
    if (draft.rec) {
      await tx.update(businessRecords).set({ brandId: draft.brandId, amountP: v.totalP, ...(v.shopifyOrderId ? {} : { workDate: v.issuedOn, taxableP: v.taxableP, gstP: v.cgstP + v.sgstP + v.igstP }) }).where(eq(businessRecords.id, draft.rec.id));
    } else {
      const [sale] = await tx.insert(businessRecords).values({ number: await nextNumber(tx, "sale", v.issuedOn), entityId: v.entityId, brandId: draft.brandId, kind: "sale", workDate: v.issuedOn, amountP: v.totalP,
        taxableP: v.shopifyOrderId ? 0 : v.taxableP, gstP: v.shopifyOrderId ? 0 : v.cgstP + v.sgstP + v.igstP,
        contactId: draft.contactId, paymentTerms: "credit", paymentMethod: "credit", source: v.shopifyOrderId ? "shopify" : "dispatch", sourceRef: draft.sourceRef,
        shopifyOrderId: v.shopifyOrderId, reference: number, note: v.customerName, userId: input.userId }).returning({ id: businessRecords.id });
      recordId = sale.id;
    }
    const [row] = await tx.insert(invoices).values({ ...v, number, recordId, userId: input.userId }).returning({ id: invoices.id });
    await audit(tx, { userId: input.userId, action: "create", entityType: "invoice", entityId: row.id, summary: `Invoice ${number} for ${v.customerName}` });
    return { id: row.id, number, created: true };
  });
}
