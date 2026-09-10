"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { businessRecords, dispatchItems, dispatches, invoices, payments, products, shopifyOrders, type DispatchStatus, type ShopifyLine } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireEditor } from "@/lib/auth";
import { todayIST } from "@/lib/dates";
import { errorMessage, parseForm, zBool, zDate, zEnum, zOptional, zOptionalMoney, zOptionalUuid, zRequired, zUuid, type ActionState } from "@/lib/forms";
import { formatINR, toPaise } from "@/lib/money";
import { nextNumber } from "@/lib/numbering";
import { withDeducted } from "@/lib/order-stock";
import { adjustStock } from "@/lib/stock";
import { queueStockPush } from "@/lib/stock-push";
import { entityExists } from "@/lib/queries/common";
import { fulfillShopifyOrder } from "@/lib/shopify-writeback";
import { checkDispatchGoods, lockDispatch } from "@/lib/dispatch-readiness";

function revalidateDispatch(id?: string) {
  for (const p of ["/dispatch", "/stock", "/sales", "/orders", "/"]) revalidatePath(p);
  if (id) revalidatePath(`/dispatch/${id}`);
}

const headerSchema = z.object({
  brandId: zRequired("Brand", 40),
  entityId: zRequired("Books", 40),
  customerName: zRequired("Customer name", 150),
  phone: zOptional(30),
  address: zOptional(1000),
  contactId: zOptionalUuid,
  orderRef: zOptional(80),
  dispatchDate: zDate,
  courier: zOptional(80),
  trackingNo: zOptional(120),
  trackingUrl: zOptional(500),
  amountP: zOptionalMoney,
  note: zOptional(1000),
});
const createSchema = headerSchema.extend({
  shopifyOrderId: zOptional(40),
  recordSale: zBool,
  channel: zOptional(80),
  paymentMethod: zOptional(20),
  productId: z.array(z.string()).optional(),
  qty: z.array(z.string()).optional(),
  unitPrice: z.array(z.string()).optional(),
});

function parseLines(productId?: string[], qty?: string[], unitPrice?: string[]) {
  const lines = (productId ?? []).map((pid, i) => ({ productId: pid, qty: Number(qty?.[i] ?? 0), unitPriceP: unitPrice?.[i]?.trim() ? toPaise(unitPrice[i]) : null }));
  if (lines.some((l) => !/^[0-9a-f-]{36}$/i.test(l.productId) || !Number.isSafeInteger(l.qty) || l.qty <= 0 || (l.unitPriceP !== null && l.unitPriceP < 0))) throw new Error("Check every product, quantity and selling price");
  if (new Set(lines.map((l) => l.productId)).size !== lines.length) throw new Error("Use one row per product and increase its quantity");
  return lines;
}

function checkPrices(lines: ReturnType<typeof parseLines>, amountP: number) {
  if (amountP < 0) throw new Error("Order value cannot be negative");
  if (lines.some((l) => l.unitPriceP !== null) && (lines.some((l) => l.unitPriceP === null) || lines.reduce((sum, l) => sum + l.unitPriceP! * l.qty, 0) !== amountP)) throw new Error("Enter a price for every item. The item totals must equal the order value.");
}

async function checkBrand(tx: Tx, lines: {productId:string}[], brandId:string) {
  const rows=await tx.select({id:products.id,brandId:products.brandId}).from(products).where(inArray(products.id,lines.map(l=>l.productId)));
  if (rows.length!==lines.length || rows.some(p=>p.brandId!==brandId)) throw new Error("Every item must belong to the selected brand");
}

export async function createDispatch(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("dispatch");
    const parsed = parseForm(createSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    if (!(await entityExists(d.entityId))) return { error: "Choose which books this belongs to", fieldErrors: { entityId: ["Unknown books"] } };
    const lines = parseLines(d.productId, d.qty, d.unitPrice);
    checkPrices(lines, d.amountP);
    if (!lines.length) return { error: "Add at least one product with a quantity" };
    const id = await db.transaction(async (tx) => {
      await checkBrand(tx,lines,d.brandId);
      if (d.shopifyOrderId) throw new Error("Create website dispatches from the order page so they keep the correct books and items");
      const number = await nextNumber(tx, "dispatch", d.dispatchDate);
      const [row] = await tx
        .insert(dispatches)
        .values({
          number,
          brandId: d.brandId,
          entityId: d.entityId,
          orderRef: d.orderRef ?? "",
          shopifyOrderId: d.shopifyOrderId ?? null,
          contactId: d.contactId ?? null,
          customerName: d.customerName,
          phone: d.phone ?? null,
          address: d.address ?? null,
          dispatchDate: d.dispatchDate,
          courier: d.courier ?? null,
          trackingNo: d.trackingNo ?? null,
          trackingUrl: d.trackingUrl ?? null,
          amountP: d.amountP,
          note: d.note ?? null,
          userId: user.id,
        })
        .returning({ id: dispatches.id });
      await tx.insert(dispatchItems).values(lines.map((l) => ({ dispatchId: row.id, ...l })));
      if (d.recordSale && d.amountP > 0) {
        const saleNumber = await nextNumber(tx, "sale", d.dispatchDate);
        await tx.insert(businessRecords).values({
          number: saleNumber,
          entityId: d.entityId,
          kind: "sale",
          brandId: d.brandId,
          workDate: d.dispatchDate,
          amountP: d.amountP,
          channel: d.channel ?? "Wholesale / B2B",
          category: "Dispatch",
          reference: d.orderRef || number,
          contactId: d.contactId ?? null,
          paymentMethod: (d.paymentMethod as "cash") || "credit",
          paymentTerms: !d.paymentMethod || ["credit", "cod"].includes(d.paymentMethod) ? "credit" : "paid",
          source: "dispatch",
          sourceRef: `dispatch:${row.id}`,
          note: `${d.customerName} · ${number}`,
          userId: user.id,
        });
      }
      await audit(tx, { userId: user.id, action: "create", entityType: "dispatch", entityId: row.id, summary: `${number} for ${d.customerName} (${lines.reduce((s, l) => s + l.qty, 0)} pcs)` });
      return row.id;
    });
    revalidateDispatch(id);
    return { ok: true, message: "Dispatch created", id };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const updateSchema = headerSchema.extend({ id: zUuid("dispatch"), productId: z.array(z.string()).optional(), qty: z.array(z.string()).optional(), unitPrice: z.array(z.string()).optional() });

export async function updateDispatch(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("dispatch");
    const parsed = parseForm(updateSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    if (!(await entityExists(d.entityId))) return { error: "Choose which books this belongs to", fieldErrors: { entityId: ["Unknown books"] } };
    await db.transaction(async (tx) => {
      const [ref] = await tx.select().from(dispatches).where(eq(dispatches.id, d.id));
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ref?.shopifyOrderId ? `order:${ref.shopifyOrderId}` : `dispatch:${d.id}`}, 0))`);
      const [existing] = await tx.select().from(dispatches).where(eq(dispatches.id, d.id)).for("update");
      if (!existing) throw new Error("Dispatch not found");
      if (!["pending", "packed"].includes(existing.status)) throw new Error("Only an unshipped dispatch can be edited");
      if (existing.shopifyOrderId && d.productId) throw new Error("Website dispatch items are managed from the order");
      const [issued] = await tx.select({ id: invoices.id }).from(invoices).where(and(isNull(invoices.voidedAt), existing.shopifyOrderId ? eq(invoices.shopifyOrderId, existing.shopifyOrderId) : eq(invoices.dispatchId, d.id)));
      const changesSale = existing.entityId !== d.entityId || existing.amountP !== d.amountP || existing.contactId !== (d.contactId ?? null) || existing.customerName !== d.customerName || existing.address !== (d.address ?? null) || existing.dispatchDate !== d.dispatchDate || existing.brandId !== d.brandId || existing.orderRef !== (d.orderRef ?? "");
      if (issued && (changesSale || d.productId)) throw new Error("This dispatch has an issued invoice. Its buyer, items and selling value are locked. Use the tracking controls to update courier details.");
      if (existing.shopifyOrderId && changesSale) throw new Error("Change website order details in Shopify, then refresh the order here");
      const [sale] = await tx.select().from(businessRecords).where(eq(businessRecords.sourceRef, `dispatch:${d.id}`)).for("update");
      if (sale && changesSale) {
        const [receipt] = await tx.select({ id: payments.id }).from(payments).where(and(eq(payments.recordId, sale.id), isNull(payments.voidedAt)));
        if (receipt) throw new Error("This sale has an allocated payment. Accounts must review it before changing its value or books.");
        await tx.update(businessRecords).set({ entityId: d.entityId, brandId: d.brandId, workDate: d.dispatchDate, amountP: d.amountP, contactId: d.contactId ?? null, reference: d.orderRef || existing.number, note: `${d.customerName} · ${existing.number}` }).where(eq(businessRecords.id, sale.id));
      }

      await tx
        .update(dispatches)
        .set({ brandId: d.brandId, entityId: d.entityId, customerName: d.customerName, phone: d.phone ?? null, address: d.address ?? null, contactId: d.contactId ?? null, orderRef: d.orderRef ?? "", dispatchDate: d.dispatchDate, courier: d.courier ?? null, trackingNo: d.trackingNo ?? null, trackingUrl: d.trackingUrl ?? null, amountP: d.amountP, note: d.note ?? null })
        .where(eq(dispatches.id, d.id));
      if (!existing.stockDeducted && (d.productId || existing.brandId!==d.brandId)) {
        const checkLines=d.productId ? parseLines(d.productId,d.qty,d.unitPrice) : await tx.select({productId:dispatchItems.productId}).from(dispatchItems).where(eq(dispatchItems.dispatchId,d.id));
        await checkBrand(tx,checkLines,d.brandId);
      }
      if (!existing.stockDeducted && d.productId) {
        const lines = parseLines(d.productId, d.qty, d.unitPrice);
        checkPrices(lines, d.amountP);
        if (!lines.length) throw new Error("Add at least one product with a quantity");
        await tx.delete(dispatchItems).where(eq(dispatchItems.dispatchId, d.id));
        await tx.insert(dispatchItems).values(lines.map((l) => ({ dispatchId: d.id, ...l })));
      }
      if (changesSale || d.productId) await tx.update(dispatches).set({ status: "pending", qualityCheckedAt: null, qualityCheckedBy: null, billingCheckedAt: null, billingCheckedBy: null, billingReference: null }).where(eq(dispatches.id, d.id));
      await audit(tx, { userId: user.id, action: "update", entityType: "dispatch", entityId: d.id, summary: `Edited ${existing.number}` });
    });
    revalidateDispatch(d.id);
    return { ok: true, message: "Dispatch updated" };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const STATUSES = ["pending", "packed", "shipped", "delivered", "returned", "cancelled"] as const;
const statusSchema = z.object({
  id: zUuid("dispatch"),
  status: zEnum(STATUSES, "status"),
  courier: zOptional(80),
  trackingNo: zOptional(120),
  trackingUrl: zOptional(500),
  reason: zOptional(500),
  fulfilShopify: zBool,
  notifyCustomer: zBool,
});

const ALLOWED: Record<DispatchStatus, DispatchStatus[]> = {
  pending: ["packed", "cancelled"],
  packed: ["shipped", "pending", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  returning: [],
  received: [],
  returned: [],
  cancelled: ["pending"],
};

export async function setDispatchStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("dispatch");
    const parsed = parseForm(statusSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    const outcome = await db.transaction(async (tx) => {
      const [ref] = await tx.select().from(dispatches).where(eq(dispatches.id, d.id));
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ref?.shopifyOrderId ? `order:${ref.shopifyOrderId}` : `dispatch:${d.id}`}, 0))`);
      const [dsp] = await tx.select().from(dispatches).where(eq(dispatches.id, d.id)).for("update");
      if (!dsp) throw new Error("Dispatch not found");
      if (!ALLOWED[dsp.status].includes(d.status)) throw new Error(`Cannot move from ${dsp.status} to ${d.status}`);
      if (d.status === "packed" || d.status === "shipped") {
        if (!dsp.qualityCheckedAt || !dsp.billingCheckedAt) throw new Error("Complete QC and billing verification before packing or shipping");
        await checkDispatchGoods(tx, dsp);
      }
      if (d.status === "cancelled" && dsp.stockDeducted) throw new Error("Stock has already left. Record a physical return instead of cancelling.");
      if (["cancelled", "returned"].includes(d.status)) {
        const [issued] = await tx.select({ number: invoices.number }).from(invoices).where(and(isNull(invoices.voidedAt), dsp.shopifyOrderId ? eq(invoices.shopifyOrderId, dsp.shopifyOrderId) : eq(invoices.dispatchId, d.id)));
        if (issued) throw new Error(`Invoice ${issued.number} is still issued. Accounts must cancel an unshipped invoice or process a credit note before returning this sale.`);
      }

      const items = await tx.select({productId: dispatchItems.productId, qty: sql<number>`sum(${dispatchItems.qty})::int`}).from(dispatchItems).where(eq(dispatchItems.dispatchId, d.id)).groupBy(dispatchItems.productId).orderBy(dispatchItems.productId);
      const now = new Date();
      const set: Partial<typeof dispatches.$inferInsert> = { status: d.status };
      if (d.courier !== undefined) set.courier = d.courier;
      if (d.trackingNo !== undefined) set.trackingNo = d.trackingNo;
      if (d.trackingUrl !== undefined) set.trackingUrl = d.trackingUrl;

      // A dispatch for a website order shares its stock effect with the order sync. Each order line remembers how
      // many units already left stock, so whichever side acts first deducts and the other only tops up the difference.
      const [order] = dsp.shopifyOrderId ? await tx.select().from(shopifyOrders).where(eq(shopifyOrders.id, dsp.shopifyOrderId)).for("update") : [];
      const orderLines: ShopifyLine[] = order ? withDeducted(order.lineItems, order.stockDeducted, order.stockRestored) : [];
      const variantOf = new Map<string, string | null>();
      if (order && items.length) {
        const rows = await tx.select({ id: products.id, variantId: products.shopifyVariantId }).from(products).where(inArray(products.id, items.map((i) => i.productId)));
        for (const r of rows) variantOf.set(r.id, r.variantId);
      }
      const notes: string[] = [];
      let touched = false;

      if (d.status === "shipped") {
        set.shippedAt = now;
        if (!dsp.stockDeducted) {
          let any = false;
          for (const it of items) {
            const matches = orderLines.filter(l => l.variantId === variantOf.get(it.productId));
            const already = matches.reduce((n,l) => n + (l.deductedQty ?? 0), 0);
            const qty = Math.max(0, it.qty - already);
            let toAssign = qty;
            for (const line of matches) {
              const assigned = Math.min(toAssign, Math.max(0, line.quantity - (line.deductedQty ?? 0)));
              line.deductedQty = (line.deductedQty ?? 0) + assigned;
              toAssign -= assigned;
            }
            if (qty > 0) {
              await adjustStock(tx, { productId: it.productId, kind: "dispatch_out", qty: -qty, refType: "dispatch", refId: dsp.number, note: `Dispatched ${dsp.number} to ${dsp.customerName}`, userId: user.id });
              any = true;
            }
          }
          if (order) {
            await tx.update(shopifyOrders).set({ lineItems: orderLines, stockDeducted: order.stockDeducted || any, stockRestored: false, localReturns: true }).where(eq(shopifyOrders.id, order.id));
            if (!any) notes.push("stock had already been deducted by the website order");
          }
          set.stockDeducted = true;
          touched = any;
        }
      }
      if (d.status === "delivered") set.deliveredAt = now;
      if (d.status === "pending" || d.status === "cancelled") Object.assign(set, {qualityCheckedAt: null, qualityCheckedBy: null, billingCheckedAt: null, billingCheckedBy: null, billingReference: null});


      if (d.reason) set.note = dsp.note ? `${dsp.note}\n${d.status}: ${d.reason}` : `${d.status}: ${d.reason}`;
      await tx.update(dispatches).set(set).where(eq(dispatches.id, d.id));
      if (d.status === "cancelled" || d.status === "returned") {
        await tx
          .update(businessRecords)
          .set({ voidedAt: now, voidedBy: user.id, voidReason: `Dispatch ${d.status}${d.reason ? `: ${d.reason}` : ""}` })
          .where(and(eq(businessRecords.sourceRef, `dispatch:${d.id}`), isNull(businessRecords.voidedAt)));
      } else if (dsp.status === "cancelled" && d.status === "pending") {
        // reopening a cancelled dispatch brings back the sale it had recorded
        await tx
          .update(businessRecords)
          .set({ voidedAt: null, voidedBy: null, voidReason: null })
          .where(and(eq(businessRecords.sourceRef, `dispatch:${d.id}`), sql`${businessRecords.voidReason} like 'Dispatch cancelled%'`));
      }
      await audit(tx, { userId: user.id, action: d.status, entityType: "dispatch", entityId: d.id, summary: `${dsp.number} marked ${d.status}${d.trackingNo ? ` (${d.courier ?? ""} ${d.trackingNo})` : ""}` });
      return {
        number: dsp.number,
        shopifyOrderId: dsp.shopifyOrderId,
        fulfillmentItems: (await tx.select({ variantId: products.shopifyVariantId, qty: dispatchItems.qty }).from(dispatchItems).innerJoin(products, eq(products.id, dispatchItems.productId)).where(eq(dispatchItems.dispatchId, d.id))),
        productIds: touched && !dsp.shopifyOrderId ? items.map((i) => i.productId) : [],
        courier: set.courier ?? dsp.courier,
        trackingNo: set.trackingNo ?? dsp.trackingNo,
        trackingUrl: set.trackingUrl ?? dsp.trackingUrl,
        notes,
      };
    });
    queueStockPush(outcome.productIds);
    revalidateDispatch(d.id);
    let message = `${outcome.number} marked ${d.status}${outcome.notes.length ? ` (${outcome.notes.join("; ")})` : ""}`;
    if (d.status === "shipped" && d.fulfilShopify && outcome.shopifyOrderId) {
      try {
        const r = await fulfillShopifyOrder(outcome.shopifyOrderId, { company: outcome.courier, number: outcome.trackingNo, url: outcome.trackingUrl }, d.notifyCustomer, outcome.fulfillmentItems);
        message += `. ${r.message}`;
        revalidatePath(`/orders/${outcome.shopifyOrderId}`);
      } catch (err) {
        message += `. Shopify was not updated: ${errorMessage(err)}`;
      }
    }
    return { ok: true, message };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

/** Build a dispatch from a synced website order and open it. */
export async function createDispatchFromOrder(orderId: string) {
  const user = await requireEditor("dispatch");
  const id = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`order:${orderId}`}, 0))`);
    const [order] = await tx.select().from(shopifyOrders).where(eq(shopifyOrders.id, orderId));
    if (!order || order.cancelledAt || order.stockRestored || order.localReturns) throw new Error("Choose an active website order without a return");
    const [existing] = await tx.select({id: dispatches.id}).from(dispatches).where(eq(dispatches.shopifyOrderId, orderId));
    if (existing) return existing.id;
    const addr = order.shippingAddress ?? {};
    const address = [addr.address1, addr.address2, addr.city, addr.province, addr.zip, addr.country].filter(Boolean).join(", ");
    const today = todayIST();
    const number = await nextNumber(tx, "dispatch", today);
    const [row] = await tx
      .insert(dispatches)
      .values({
        number,
        // orders synced before stores existed carry no brand/books; they were all Baby Gambling website orders
        brandId: order.brandId ?? "babygambling",
        entityId: order.entityId ?? "brand",
        orderRef: order.name,
        shopifyOrderId: order.id,
        customerName: order.customerName,
        phone: order.phone,
        address,
        dispatchDate: today,
        amountP: order.totalP,
        note: order.note,
        userId: user.id,
      })
      .returning({ id: dispatches.id });
    const missing: string[] = [];
    const items: { productId: string; qty: number }[] = [];
    for (const line of order.lineItems) {
      const [p] = line.variantId ? await tx.select({ id: products.id }).from(products).where(eq(products.shopifyVariantId, line.variantId)).limit(1) : [];
      if (p && line.quantity > 0) items.push({ productId: p.id, qty: line.quantity });
      else missing.push(`${line.quantity} × ${line.title}`);
    }
    if (missing.length || !items.length) throw new Error("Map all order items to products before creating a dispatch");
    const combined = new Map<string, number>();
    for (const item of items) combined.set(item.productId, (combined.get(item.productId) ?? 0) + item.qty);
    await tx.insert(dispatchItems).values([...combined].map(([productId, qty]) => ({dispatchId: row.id, productId, qty})));
    if (missing.length) await tx.update(dispatches).set({ note: `${order.note ? order.note + "\n" : ""}Not matched to products: ${missing.join("; ")}` }).where(eq(dispatches.id, row.id));
    await audit(tx, { userId: user.id, action: "create", entityType: "dispatch", entityId: row.id, summary: `${number} from website order ${order.name} (${formatINR(order.totalP)})` });
    return row.id;
  });
  revalidateDispatch(id);
  redirect(`/dispatch/${id}`);
}

/** Existing module permissions apply: dispatch verifies goods; accounts verifies billing. */
export async function verifyDispatch(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const parsed = parseForm(z.object({ id: zUuid("dispatch"), check: zEnum(["quality", "billing"] as const, "check"), reference: zRequired("Check note / billing reference", 500) }), formData);
    if (!parsed.ok) return {error: parsed.error, fieldErrors: parsed.fieldErrors};
    const d = parsed.data;
    const user = await requireEditor(d.check === "billing" ? "sales" : "dispatch");
    await db.transaction(async tx => {
      const dsp = await lockDispatch(tx, d.id);
      if (dsp.status !== "pending") throw new Error("Checks can only be recorded before packing");
      if (d.check === "billing" && !dsp.qualityCheckedAt) throw new Error("Complete QC verification before billing verification");
      await checkDispatchGoods(tx, dsp);
      if (d.check === "quality") {
        await tx.update(dispatches).set({qualityCheckedAt: new Date(), qualityCheckedBy: user.id, billingCheckedAt: null, billingCheckedBy: null, billingReference: null}).where(eq(dispatches.id, d.id));
      } else {
        await tx.update(dispatches).set({billingCheckedAt: new Date(), billingCheckedBy: user.id, billingReference: d.reference}).where(eq(dispatches.id, d.id));
      }
      await audit(tx, {userId: user.id, action: `verify_${d.check}`, entityType: "dispatch", entityId: d.id, summary: `${dsp.number}: ${d.check} verified. ${d.reference}`});
    });
    revalidateDispatch(d.id);
    return {ok: true, message: d.check === "quality" ? "QC verified" : "Billing verified"};
  } catch (err) { return {error: errorMessage(err)}; }
}
