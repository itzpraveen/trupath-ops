import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { productionEntries, products, shopifyOrders } from "@/db/schema";

export type ProductionOrderOption = {orderId: string; lineId: string; productId: string; label: string; remaining: number; awaitingQc: number; accepted: number};

/** Operational quantities only: factory access does not expose customer or financial records. */
export async function productionOrderOptions(orderId?: string): Promise<ProductionOrderOption[]> {
  const [orders, catalogue, made] = await Promise.all([
    db.select({id: shopifyOrders.id, name: shopifyOrders.name, brandId: shopifyOrders.brandId, lines: shopifyOrders.lineItems}).from(shopifyOrders).where(and(isNull(shopifyOrders.cancelledAt), eq(shopifyOrders.localReturns, false), eq(shopifyOrders.stockRestored, false), orderId ? eq(shopifyOrders.id, orderId) : sql`${shopifyOrders.fulfillmentStatus} not in ('FULFILLED', 'RESTOCKED')`)).orderBy(asc(shopifyOrders.createdAtShop)),
    db.select({id: products.id, variantId: products.shopifyVariantId, brandId: products.brandId}).from(products),
    db.select({orderId: productionEntries.shopifyOrderId, lineId: productionEntries.shopifyLineId, qty: productionEntries.qty, accepted: productionEntries.acceptedQty, rejected: productionEntries.rejectedQty}).from(productionEntries).where(and(isNull(productionEntries.voidedAt), orderId ? eq(productionEntries.shopifyOrderId, orderId) : sql`${productionEntries.shopifyOrderId} is not null`)),
  ]);
  return orders.flatMap(o => o.lines.flatMap(l => {
    const product = catalogue.find(p => p.variantId === l.variantId && p.brandId === o.brandId);
    if (!product || l.quantity <= 0) return [];
    const batches = made.filter(b => b.orderId === o.id && b.lineId === l.id);
    const madeQty = batches.reduce((n,b) => n + b.qty - b.rejected, 0);
    return [{orderId: o.id, lineId: l.id, productId: product.id, label: `${o.name} · ${l.title}${l.variantTitle ? ` · ${l.variantTitle}` : ""}`, remaining: Math.max(0, l.quantity - Math.max(madeQty, l.fulfilledQty ?? 0)), awaitingQc: batches.reduce((n,b) => n + b.qty - b.accepted - b.rejected, 0), accepted: batches.reduce((n,b) => n + b.accepted, 0)}];
  }));
}
