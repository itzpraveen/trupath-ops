import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { dispatchItems, dispatches, productionEntries, products, shopifyOrders } from "@/db/schema";

export async function lockDispatch(tx: Tx, id: string) {
  const [ref] = await tx.select().from(dispatches).where(eq(dispatches.id, id));
  if (!ref) throw new Error("Dispatch not found");
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ref.shopifyOrderId ? `order:${ref.shopifyOrderId}` : `dispatch:${id}`}, 0))`);
  return (await tx.select().from(dispatches).where(eq(dispatches.id, id)).for("update"))[0];
}

/** Re-read quantities at each gate; a saved check never overrides current stock or order changes. */
export async function checkDispatchGoods(tx: Tx, dsp: typeof dispatches.$inferSelect) {
  const rows = await tx.select({ item: dispatchItems, product: products }).from(dispatchItems).innerJoin(products, eq(products.id, dispatchItems.productId)).where(eq(dispatchItems.dispatchId, dsp.id));
  const combined = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    const existing = combined.get(row.product.id);
    if (existing) existing.item.qty += row.item.qty;
    else combined.set(row.product.id, row);
  }
  const items = [...combined.values()];
  if (!items.length) throw new Error("Add the products before checking this dispatch");
  const [order] = dsp.shopifyOrderId ? await tx.select().from(shopifyOrders).where(eq(shopifyOrders.id, dsp.shopifyOrderId)) : [];
  if (dsp.shopifyOrderId && (!order || order.cancelledAt || order.localReturns || order.stockRestored)) throw new Error("This website order is cancelled or under return review");
  if (order) {
    const expected = new Map<string, number>();
    for (const line of order.lineItems) {
      if (line.quantity <= 0) continue;
      if (!line.variantId) throw new Error("Map every website order item to a product before dispatch");
      expected.set(line.variantId, (expected.get(line.variantId) ?? 0) + line.quantity);
    }
    for (const { item, product } of items) {
      const qty = product.shopifyVariantId ? expected.get(product.shopifyVariantId) : undefined;
      if (!qty || item.qty > qty) throw new Error("Dispatch items no longer match the website order. Review the order before packing.");
      expected.set(product.shopifyVariantId!, qty - item.qty);
    }
    if ([...expected.keys()].some(id => !items.some(r => r.product.shopifyVariantId === id))) throw new Error("Some website order items are missing from this dispatch");
  }
  for (const { item, product } of items) {
    if (product.brandId !== dsp.brandId) throw new Error("Dispatch product and brand do not match");
    const already = order?.lineItems.filter(l => l.variantId === product.shopifyVariantId).reduce((n, l) => n + (l.deductedQty ?? (order.stockDeducted && !order.stockRestored ? l.quantity : 0)), 0) ?? 0;
    if (product.stockQty < Math.max(0, item.qty - already)) throw new Error(`${product.name}: insufficient QC-accepted finished stock`);
    if (order) {
      const [production] = await tx.select({ made: sql<number>`coalesce(sum(${productionEntries.qty}),0)::int`, accepted: sql<number>`coalesce(sum(${productionEntries.acceptedQty}),0)::int` }).from(productionEntries).where(and(eq(productionEntries.shopifyOrderId, order.id), eq(productionEntries.productId, product.id), isNull(productionEntries.voidedAt)));
      if (production.made > 0 && production.accepted < item.qty) throw new Error(`${product.name}: complete QC acceptance for this order before packing`);
    }
  }
}
