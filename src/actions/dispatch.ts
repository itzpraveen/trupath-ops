"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { businessRecords, dispatchItems, dispatches, products, shopifyOrders, type DispatchStatus, type ShopifyLine } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireEditor } from "@/lib/auth";
import { todayIST } from "@/lib/dates";
import { errorMessage, parseForm, zBool, zDate, zEnum, zOptional, zOptionalMoney, zOptionalUuid, zRequired, zUuid, type ActionState } from "@/lib/forms";
import { formatINR } from "@/lib/money";
import { nextNumber } from "@/lib/numbering";
import { lineForVariant, withDeducted } from "@/lib/order-stock";
import { adjustStock } from "@/lib/stock";
import { queueStockPush } from "@/lib/stock-push";
import { entityExists } from "@/lib/queries/common";
import { fulfillShopifyOrder } from "@/lib/shopify-writeback";

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
});

function parseLines(productId?: string[], qty?: string[]) {
  const lines = (productId ?? []).map((pid, i) => ({ productId: pid, qty: Math.floor(Number(qty?.[i] ?? 0)) })).filter((l) => /^[0-9a-f-]{36}$/i.test(l.productId) && l.qty > 0);
  const merged = new Map<string, number>();
  for (const l of lines) merged.set(l.productId, (merged.get(l.productId) ?? 0) + l.qty);
  return [...merged.entries()].map(([productId, qty]) => ({ productId, qty }));
}

export async function createDispatch(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("dispatch");
    const parsed = parseForm(createSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    if (!(await entityExists(d.entityId))) return { error: "Choose which books this belongs to", fieldErrors: { entityId: ["Unknown books"] } };
    const lines = parseLines(d.productId, d.qty);
    if (!lines.length) return { error: "Add at least one product with a quantity" };
    const id = await db.transaction(async (tx) => {
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
          workDate: d.dispatchDate,
          amountP: d.amountP,
          channel: d.channel ?? "Wholesale / B2B",
          category: "Dispatch",
          reference: d.orderRef || number,
          contactId: d.contactId ?? null,
          paymentMethod: (d.paymentMethod as "cash") || "credit",
          paymentTerms: !d.paymentMethod || d.paymentMethod === "credit" ? "credit" : "paid",
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

const updateSchema = headerSchema.extend({ id: zUuid("dispatch"), productId: z.array(z.string()).optional(), qty: z.array(z.string()).optional() });

export async function updateDispatch(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("dispatch");
    const parsed = parseForm(updateSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    if (!(await entityExists(d.entityId))) return { error: "Choose which books this belongs to", fieldErrors: { entityId: ["Unknown books"] } };
    await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(dispatches).where(eq(dispatches.id, d.id)).for("update");
      if (!existing) throw new Error("Dispatch not found");
      await tx
        .update(dispatches)
        .set({ brandId: d.brandId, entityId: d.entityId, customerName: d.customerName, phone: d.phone ?? null, address: d.address ?? null, contactId: d.contactId ?? null, orderRef: d.orderRef ?? "", dispatchDate: d.dispatchDate, courier: d.courier ?? null, trackingNo: d.trackingNo ?? null, trackingUrl: d.trackingUrl ?? null, amountP: d.amountP, note: d.note ?? null })
        .where(eq(dispatches.id, d.id));
      if (!existing.stockDeducted && d.productId) {
        const lines = parseLines(d.productId, d.qty);
        if (!lines.length) throw new Error("Add at least one product with a quantity");
        await tx.delete(dispatchItems).where(eq(dispatchItems.dispatchId, d.id));
        await tx.insert(dispatchItems).values(lines.map((l) => ({ dispatchId: d.id, ...l })));
      }
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
  pending: ["packed", "shipped", "cancelled"],
  packed: ["shipped", "pending", "cancelled"],
  shipped: ["delivered", "returned", "cancelled"],
  delivered: ["returned"],
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
      const [dsp] = await tx.select().from(dispatches).where(eq(dispatches.id, d.id)).for("update");
      if (!dsp) throw new Error("Dispatch not found");
      if (!ALLOWED[dsp.status].includes(d.status)) throw new Error(`Cannot move from ${dsp.status} to ${d.status}`);
      const items = await tx.select().from(dispatchItems).where(eq(dispatchItems.dispatchId, d.id));
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
            const line = order ? lineForVariant(orderLines, variantOf.get(it.productId)) : undefined;
            const already = line && !order?.stockRestored ? (line.deductedQty ?? 0) : 0;
            const qty = Math.max(0, it.qty - already);
            if (line) line.deductedQty = already + qty;
            if (qty > 0) {
              await adjustStock(tx, { productId: it.productId, kind: "dispatch_out", qty: -qty, refType: "dispatch", refId: dsp.number, note: `Dispatched ${dsp.number} to ${dsp.customerName}`, userId: user.id });
              any = true;
            }
          }
          if (order) {
            await tx.update(shopifyOrders).set({ lineItems: orderLines, stockDeducted: order.stockDeducted || any, stockRestored: false }).where(eq(shopifyOrders.id, order.id));
            if (!any) notes.push("stock had already been deducted by the website order");
          }
          set.stockDeducted = true;
          touched = any;
        }
      }
      if (d.status === "delivered") set.deliveredAt = now;

      if ((d.status === "returned" || d.status === "cancelled") && dsp.stockDeducted) {
        const note = `${d.status === "returned" ? "Returned" : "Cancelled"} ${dsp.number}${d.reason ? `: ${d.reason}` : ""}`;
        const putBack = async (productId: string, qty: number) => {
          await adjustStock(tx, { productId, kind: "return_in", qty, refType: "dispatch", refId: dsp.number, note, userId: user.id });
          touched = true;
        };
        if (order) {
          if (order.stockRestored) {
            notes.push("the website order had already put its stock back");
          } else {
            // everything the website order took out, whether this dispatch or the order sync deducted it
            for (const l of orderLines) {
              const q = l.deductedQty ?? 0;
              if (!l.variantId || q <= 0) continue;
              const [p] = await tx.select({ id: products.id }).from(products).where(eq(products.shopifyVariantId, l.variantId)).limit(1);
              if (p) await putBack(p.id, q);
              l.deductedQty = 0;
            }
          }
          // anything on the dispatch that is not part of the website order
          for (const it of items) if (!lineForVariant(orderLines, variantOf.get(it.productId))) await putBack(it.productId, it.qty);
          await tx.update(shopifyOrders).set({ lineItems: orderLines, stockRestored: true }).where(eq(shopifyOrders.id, order.id));
        } else {
          for (const it of items) await putBack(it.productId, it.qty);
        }
        set.stockDeducted = false;
      }

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
        const r = await fulfillShopifyOrder(outcome.shopifyOrderId, { company: outcome.courier, number: outcome.trackingNo, url: outcome.trackingUrl }, d.notifyCustomer);
        message += `. ${r.message}`;
        revalidatePath(`/orders/${outcome.shopifyOrderId}`);
      } catch (err) {
        return { ok: true, message: `${message}. Shopify was not updated: ${errorMessage(err)}` };
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
  const [order] = await db.select().from(shopifyOrders).where(eq(shopifyOrders.id, orderId)).limit(1);
  if (!order) throw new Error("Order not found");
  const [existing] = await db.select({ id: dispatches.id }).from(dispatches).where(eq(dispatches.shopifyOrderId, orderId)).limit(1);
  if (existing) redirect(`/dispatch/${existing.id}`);
  const addr = order.shippingAddress ?? {};
  const address = [addr.address1, addr.address2, addr.city, addr.province, addr.zip, addr.country].filter(Boolean).join(", ");
  const id = await db.transaction(async (tx) => {
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
    if (items.length) await tx.insert(dispatchItems).values(items.map((i) => ({ dispatchId: row.id, ...i })));
    if (missing.length) await tx.update(dispatches).set({ note: `${order.note ? order.note + "\n" : ""}Not matched to products: ${missing.join("; ")}` }).where(eq(dispatches.id, row.id));
    await audit(tx, { userId: user.id, action: "create", entityType: "dispatch", entityId: row.id, summary: `${number} from website order ${order.name} (${formatINR(order.totalP)})` });
    return row.id;
  });
  revalidateDispatch(id);
  redirect(`/dispatch/${id}`);
}
