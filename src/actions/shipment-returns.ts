"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { creditNotes, dispatchItems, dispatches, invoices, products, shipmentReturnEvents, shipmentReturns, shopifyOrders } from "@/db/schema";
import { requireEditor } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { lockDispatch } from "@/lib/dispatch-readiness";
import { errorMessage, parseForm, zEnum, zInt, zRequired, zUuid, type ActionState } from "@/lib/forms";
import { adjustStock } from "@/lib/stock";
import { queueStockPush } from "@/lib/stock-push";

function refresh(id: string) {
  for (const path of ["/dispatch", `/dispatch/${id}`, "/orders", "/stock", "/sales", "/"]) revalidatePath(path);
}

export async function startShipmentReturn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("dispatch");
    const parsed = parseForm(z.object({id: zUuid("dispatch"), reason: zRequired("Return reason", 1000)}), formData);
    if (!parsed.ok) return {error: parsed.error, fieldErrors: parsed.fieldErrors};
    const d = parsed.data;
    const result = await db.transaction(async tx => {
      const dsp = await lockDispatch(tx, d.id);
      const [existing] = await tx.select().from(shipmentReturns).where(eq(shipmentReturns.dispatchId, d.id));
      if (existing) return existing;
      if (!["shipped", "delivered"].includes(dsp.status) || !dsp.stockDeducted) throw new Error("Only shipped goods can start a return");
      const [invoice] = await tx.select().from(invoices).where(and(eq(invoices.dispatchId, d.id), isNull(invoices.voidedAt)));
      if (invoice && (await tx.select({id: creditNotes.id}).from(creditNotes).where(eq(creditNotes.invoiceId, invoice.id))).length) throw new Error("This parcel already has a credit-note return. Continue that return with accounts to avoid duplicate receipt or stock.");
      if (dsp.shopifyOrderId) {
        const [order] = await tx.select().from(shopifyOrders).where(eq(shopifyOrders.id, dsp.shopifyOrderId)).for("update");
        if (!order || order.stockRestored) throw new Error("Website stock was already restored. Reconcile it before recording a physical return here.");
        await tx.update(shopifyOrders).set({localReturns: true}).where(eq(shopifyOrders.id, order.id));
      }
      const items = await tx.select({item: dispatchItems, name: products.name, variant: products.variant}).from(dispatchItems).innerJoin(products, eq(products.id, dispatchItems.productId)).where(eq(dispatchItems.dispatchId, d.id));
      if (!items.length) throw new Error("The dispatch has no mapped products to receive");
      const rawLines = items.map(r => ({productId: r.item.productId, name: `${r.name} ${r.variant}`.trim(), expectedQty: r.item.qty, receivedQty: 0, saleableQty: 0, damagedQty: 0}));
      const combined = new Map<string, typeof rawLines[number]>();
      for (const line of rawLines) {
        const previous = combined.get(line.productId);
        if (previous) previous.expectedQty += line.expectedQty;
        else combined.set(line.productId, line);
      }
      const lines = [...combined.values()];
      const [row] = await tx.insert(shipmentReturns).values({dispatchId: d.id, reason: d.reason, lines, userId: user.id}).returning();
      await tx.insert(shipmentReturnEvents).values({returnId: row.id, event: "requested", note: d.reason, lines, userId: user.id});
      await tx.update(dispatches).set({status: "returning"}).where(eq(dispatches.id, d.id));
      await audit(tx, {userId: user.id, action: "return_requested", entityType: "dispatch", entityId: d.id, summary: `${dsp.number}: ${d.reason}. Awaiting physical receipt; no stock or refund posted.`});
      return row;
    });
    refresh(d.id);
    return {ok: true, id: result.id, message: "Return opened. Stock stays out until receipt and inspection."};
  } catch (err) { return {error: errorMessage(err)}; }
}

export async function progressShipmentReturn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("dispatch");
    const parsed = parseForm(z.object({id: zUuid("dispatch"), revision: zInt("Revision"), stage: zEnum(["in_transit", "received", "inspected"] as const, "return stage"), note: zRequired("Return note", 1000)}), formData);
    if (!parsed.ok) return {error: parsed.error, fieldErrors: parsed.fieldErrors};
    const d = parsed.data;
    const productIds = await db.transaction(async tx => {
      const dsp = await lockDispatch(tx, d.id);
      const [row] = await tx.select().from(shipmentReturns).where(eq(shipmentReturns.dispatchId, d.id)).for("update");
      if (!row || row.revision !== d.revision) throw new Error("This return was already updated. Refresh and review its current stage.");
      const allowed: Record<string, string[]> = {requested: ["in_transit", "received"], in_transit: ["received"], received: ["inspected"], inspected: []};
      if (!allowed[row.stage].includes(d.stage)) throw new Error("Record physical receipt before inspection; completed inspections cannot be repeated");
      const count = (name: string, max: number) => {
        const raw = formData.get(name);
        if (typeof raw !== "string" || !/^\d+$/.test(raw)) throw new Error("Enter a whole-number quantity for every product, including zero");
        const n = Number(raw);
        if (!Number.isSafeInteger(n) || n < 0 || n > max) throw new Error(`Quantity must be between 0 and ${max}`);
        return n;
      };
      const lines = row.lines.map(line => {
        if (d.stage === "received") return {...line, receivedQty: count(`received:${line.productId}`, line.expectedQty)};
        if (d.stage === "inspected") {
          const saleableQty = count(`saleable:${line.productId}`, line.receivedQty);
          const damagedQty = count(`damaged:${line.productId}`, line.receivedQty);
          if (saleableQty + damagedQty !== line.receivedQty) throw new Error(`${line.name}: saleable and damaged quantities must total the received quantity`);
          return {...line, saleableQty, damagedQty};
        }
        return line;
      });
      if (d.stage === "received" && !lines.some(l => l.receivedQty > 0)) throw new Error("Record receipt only when at least one unit has physically arrived");
      const touched: string[] = [];
      if (d.stage === "inspected") {
        if (!dsp.stockDeducted) throw new Error("Stock was already restored. Reconcile this parcel before inspection.");
        for (const line of [...lines].sort((a,b) => a.productId.localeCompare(b.productId))) {
          if (!line.saleableQty) continue;
          await adjustStock(tx, {productId: line.productId, kind: "return_in", qty: line.saleableQty, refType: "shipment_return", refId: row.id, note: `${dsp.number}: inspected return. ${d.note}`, userId: user.id});
          touched.push(line.productId);
        }
      }
      await tx.update(shipmentReturns).set({stage: d.stage, lines, revision: row.revision + 1}).where(eq(shipmentReturns.id, row.id));
      await tx.insert(shipmentReturnEvents).values({returnId: row.id, event: d.stage, note: d.note, lines, userId: user.id});
      await tx.update(dispatches).set({status: d.stage === "inspected" ? "returned" : d.stage === "received" ? "received" : "returning"}).where(eq(dispatches.id, dsp.id));
      await audit(tx, {userId: user.id, action: `return_${d.stage}`, entityType: "dispatch", entityId: d.id, summary: `${dsp.number}: ${d.stage}. ${d.note}`, meta: {lines}});
      return touched;
    });
    queueStockPush(productIds);
    refresh(d.id);
    return {ok: true, message: d.stage === "inspected" ? "Inspection saved. Saleable stock restored; accounts must review any credit or refund." : d.stage === "received" ? "Receipt saved. Keep these goods aside for inspection." : "Return marked in transit"};
  } catch (err) { return {error: errorMessage(err)}; }
}
