import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { products, shopifyOrders, shopifyStores } from "@/db/schema";
import { shopifyGraphQL, syncSingleOrder } from "@/lib/shopify";
import { FULFIL_SCOPE, getStoreByShop, hasScope, INVENTORY_SCOPES, listStores, setStoreLocation, storeAuth, type StoreAuth } from "@/lib/shopify-oauth";

/* ------------------------------------------------------------------ */
/* Fulfil an order in Shopify (customer gets the tracking email)        */
/* ------------------------------------------------------------------ */

type FulfillmentOrderNode = { id: string; status: string; lineItems: { nodes: Array<{ id: string; remainingQuantity: number }> } };

export async function fulfillShopifyOrder(orderId: string, tracking: { company?: string | null; number?: string | null; url?: string | null }, notifyCustomer = true) {
  const [order] = await db.select({ id: shopifyOrders.id, name: shopifyOrders.name, shop: shopifyOrders.shop }).from(shopifyOrders).where(eq(shopifyOrders.id, orderId)).limit(1);
  if (!order) throw new Error("Order not found");
  const store = order.shop ? await getStoreByShop(order.shop) : null;
  const auth = store ? storeAuth(store) : null;
  if (!store || !auth) throw new Error("The store this order came from is not connected.");
  if (!hasScope(store.scope, FULFIL_SCOPE)) throw new Error(`${store.label} has not granted the fulfilment permission yet. Add the new scopes to the Shopify app and press "Update permissions" in Settings → Shopify.`);

  const data: { order: { fulfillmentOrders: { nodes: FulfillmentOrderNode[] } } | null } = await shopifyGraphQL(
    `query FulfillmentOrders($id: ID!) { order(id: $id) { fulfillmentOrders(first: 10) { nodes { id status lineItems(first: 100) { nodes { id remainingQuantity } } } } } }`,
    { id: `gid://shopify/Order/${orderId}` },
    auth,
  );
  const open = (data.order?.fulfillmentOrders.nodes ?? []).filter((fo) => ["OPEN", "IN_PROGRESS"].includes(fo.status) && fo.lineItems.nodes.some((li) => li.remainingQuantity > 0));
  if (!open.length) {
    await syncSingleOrder(orderId, auth);
    return { fulfilled: 0, message: `${order.name} has nothing left to fulfil in Shopify` };
  }
  const trackingInfo = tracking.number || tracking.company || tracking.url ? { company: tracking.company || undefined, number: tracking.number || undefined, url: tracking.url || undefined } : undefined;
  const input = {
    lineItemsByFulfillmentOrder: open.map((fo) => ({ fulfillmentOrderId: fo.id, fulfillmentOrderLineItems: fo.lineItems.nodes.filter((li) => li.remainingQuantity > 0).map((li) => ({ id: li.id, quantity: li.remainingQuantity })) })),
    notifyCustomer,
    ...(trackingInfo ? { trackingInfo } : {}),
  };
  const r: { fulfillmentCreate: { fulfillment: { id: string; status: string } | null; userErrors: Array<{ field: string[] | null; message: string }> } } = await shopifyGraphQL(
    `mutation Fulfil($fulfillment: FulfillmentInput!) { fulfillmentCreate(fulfillment: $fulfillment) { fulfillment { id status } userErrors { field message } } }`,
    { fulfillment: input },
    auth,
  );
  if (r.fulfillmentCreate.userErrors.length) throw new Error(`Shopify refused the fulfilment: ${r.fulfillmentCreate.userErrors.map((e) => e.message).join(", ")}`);
  await syncSingleOrder(orderId, auth);
  return { fulfilled: open.length, message: `${order.name} marked fulfilled in Shopify${trackingInfo ? " with tracking" : ""}${notifyCustomer ? "; customer notified" : ""}` };
}

/* ------------------------------------------------------------------ */
/* Push our stock counts to Shopify                                     */
/* ------------------------------------------------------------------ */

async function ensureLocation(auth: StoreAuth): Promise<string> {
  if (auth.locationId) return auth.locationId;
  const data: { locations: { nodes: Array<{ id: string; name: string; isActive: boolean; fulfillsOnlineOrders: boolean }> } } = await shopifyGraphQL(`{ locations(first: 10) { nodes { id name isActive fulfillsOnlineOrders } } }`, {}, auth);
  const loc = data.locations.nodes.find((l) => l.isActive && l.fulfillsOnlineOrders) ?? data.locations.nodes.find((l) => l.isActive) ?? data.locations.nodes[0];
  if (!loc) throw new Error(`${auth.label}: no inventory location found in Shopify`);
  await setStoreLocation(auth.storeId, loc.id);
  return loc.id;
}

export type PushResult = { pushed: number; skipped: number; errors: string[] };

/**
 * Set Shopify's on-hand quantity to our stock for the given products (only stores with stock sync on). Stock here
 * still includes units waiting to ship for open website orders, and so does Shopify's on-hand figure; Shopify works
 * out the sellable ("available") quantity by subtracting those committed units itself.
 */
export async function pushStockForProducts(productIds: string[], opts: { force?: boolean } = {}): Promise<PushResult> {
  const result: PushResult = { pushed: 0, skipped: 0, errors: [] };
  if (!productIds.length) return result;
  const rows = await db
    .select({ id: products.id, brandId: products.brandId, stockQty: products.stockQty, inventoryItemId: products.shopifyInventoryItemId, tracked: products.shopifyTracked, name: products.name })
    .from(products)
    .where(and(inArray(products.id, productIds), isNotNull(products.shopifyInventoryItemId)));
  if (!rows.length) return result;
  const stores = await listStores();
  const byBrand = new Map<string, StoreAuth>();
  for (const s of stores) {
    if (!s.active || (!s.pushInventory && !opts.force)) continue;
    const auth = storeAuth(s);
    if (auth && !byBrand.has(s.brandId)) byBrand.set(s.brandId, auth);
  }
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const auth = byBrand.get(r.brandId);
    if (!auth) {
      result.skipped++;
      continue;
    }
    if (r.tracked === false) {
      result.skipped++;
      continue;
    }
    groups.set(auth.storeId, [...(groups.get(auth.storeId) ?? []), r]);
  }
  for (const [storeId, items] of groups) {
    const auth = [...byBrand.values()].find((a) => a.storeId === storeId)!;
    try {
      const missing = INVENTORY_SCOPES.filter((s) => !hasScope(auth.scope, s));
      if (missing.length) throw new Error(`${auth.label} has not granted ${missing.join(", ")} yet. Update the app scopes and press "Update permissions".`);
      const locationId = await ensureLocation(auth);
      for (let i = 0; i < items.length; i += 100) {
        const chunk = items.slice(i, i + 100);
        const r: {
          inventorySetQuantities: {
            inventoryAdjustmentGroup: { changes: Array<{ name: string; quantityAfterChange: number | null; item: { id: string } }> } | null;
            userErrors: Array<{ field: string[] | null; message: string }>;
          };
        } = await shopifyGraphQL(
          `mutation SetStock($input: InventorySetQuantitiesInput!) {
            inventorySetQuantities(input: $input) {
              inventoryAdjustmentGroup { changes { name quantityAfterChange item { id } } }
              userErrors { field message }
            }
          }`,
          {
            input: {
              name: "on_hand",
              reason: "correction",
              ignoreCompareQuantity: true,
              quantities: chunk.map((p) => ({ inventoryItemId: `gid://shopify/InventoryItem/${p.inventoryItemId}`, locationId, quantity: Math.max(0, p.stockQty) })),
            },
          },
          auth,
        );
        if (r.inventorySetQuantities.userErrors.length) throw new Error(r.inventorySetQuantities.userErrors.map((e) => e.message).join(", "));
        // Shopify reports the sellable quantity that resulted; keep our copy of it current.
        const available = new Map<string, number>();
        for (const c of r.inventorySetQuantities.inventoryAdjustmentGroup?.changes ?? []) {
          if (c.name === "available" && c.quantityAfterChange !== null) available.set(c.item.id.split("/").pop() ?? "", c.quantityAfterChange);
        }
        for (const p of chunk) {
          const q = available.get(p.inventoryItemId ?? "");
          if (q !== undefined) await db.update(products).set({ shopifyQty: q }).where(eq(products.id, p.id));
        }
        result.pushed += chunk.length;
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return result;
}

/** Push every product of a store's brand (used by the "Push all stock now" button). */
export async function pushAllStockForStore(storeId: string): Promise<PushResult> {
  const [store] = await db.select().from(shopifyStores).where(eq(shopifyStores.id, storeId)).limit(1);
  if (!store) throw new Error("Store not found");
  const ids = await db.select({ id: products.id }).from(products).where(and(eq(products.brandId, store.brandId), eq(products.active, true), isNotNull(products.shopifyInventoryItemId)));
  return pushStockForProducts(ids.map((r) => r.id), { force: true });
}
