/**
 * One-off repair: website orders placed before a store's stock baseline (the moment the store was connected)
 * should never have changed finished stock. This puts back any deductions that were applied to such orders and
 * marks them so they are not deducted again.
 *
 * Usage: npm run stock:undo-import
 * Each store's baseline comes from Settings → Shopify (shopify_stores.baseline_at). Set STOCK_BASELINE=YYYY-MM-DDTHH:mm:ssZ
 * to use one date for every store instead.
 */
import "dotenv/config";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { withDeducted } from "../src/lib/order-stock";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sqlc = postgres(url, { max: 1, ssl: process.env.DATABASE_SSL === "require" ? "require" : undefined });
  const db = drizzle(sqlc, { schema, casing: "snake_case" });

  const override = process.env.STOCK_BASELINE ? new Date(process.env.STOCK_BASELINE) : null;
  if (override && Number.isNaN(override.getTime())) throw new Error("STOCK_BASELINE is not a valid date");
  const stores = await db.select({ shop: schema.shopifyStores.shop, label: schema.shopifyStores.label, baselineAt: schema.shopifyStores.baselineAt }).from(schema.shopifyStores);
  const baselineFor = new Map<string, Date>();
  for (const s of stores) {
    const b = override ?? s.baselineAt;
    if (b) baselineFor.set(s.shop, b);
    console.log(`${s.label} (${s.shop}): baseline ${b ? b.toISOString() : "not set (connect the store first or pass STOCK_BASELINE)"}`);
  }
  if (!baselineFor.size) throw new Error("No stock baseline found for any store.");

  const deducted = await db
    .select({ id: schema.shopifyOrders.id, name: schema.shopifyOrders.name, shop: schema.shopifyOrders.shop, createdAtShop: schema.shopifyOrders.createdAtShop, lineItems: schema.shopifyOrders.lineItems, stockDeducted: schema.shopifyOrders.stockDeducted, stockRestored: schema.shopifyOrders.stockRestored })
    .from(schema.shopifyOrders)
    .where(and(eq(schema.shopifyOrders.stockDeducted, true), eq(schema.shopifyOrders.stockRestored, false)));
  const orders = deducted.filter((o) => {
    const b = o.shop ? baselineFor.get(o.shop) : null;
    return !!b && o.createdAtShop < b;
  });
  console.log(`Historical orders with stock deducted: ${orders.length}`);
  if (!orders.length) {
    await sqlc.end();
    return;
  }

  // Put back exactly what each line took out (older rows only had the order-level flag: everything went out).
  const perVariant = new Map<string, number>();
  for (const o of orders) for (const l of withDeducted(o.lineItems, o.stockDeducted, o.stockRestored)) if (l.variantId && (l.deductedQty ?? 0) > 0) perVariant.set(l.variantId, (perVariant.get(l.variantId) ?? 0) + (l.deductedQty ?? 0));
  const variantIds = [...perVariant.keys()];
  const products = variantIds.length ? await db.select({ id: schema.products.id, name: schema.products.name, variant: schema.products.variant, shopifyVariantId: schema.products.shopifyVariantId }).from(schema.products).where(inArray(schema.products.shopifyVariantId, variantIds)) : [];

  let unitsRestored = 0;
  await db.transaction(async (tx) => {
    for (const p of products) {
      const qty = perVariant.get(p.shopifyVariantId!) ?? 0;
      if (!qty) continue;
      const [locked] = await tx.select({ stockQty: schema.products.stockQty }).from(schema.products).where(eq(schema.products.id, p.id)).for("update");
      const before = locked.stockQty;
      const after = before + qty;
      await tx.update(schema.products).set({ stockQty: after }).where(eq(schema.products.id, p.id));
      await tx.insert(schema.stockMovements).values({ productId: p.id, kind: "adjustment", qty, beforeQty: before, afterQty: after, refType: "shopify_baseline", refId: "undo-import", note: `Undo deductions from ${orders.length} website orders placed before the store was connected` });
      unitsRestored += qty;
      console.log(`  ${p.name}${p.variant ? ` — ${p.variant}` : ""}: ${before} → ${after}`);
    }
    for (const o of orders) {
      await tx
        .update(schema.shopifyOrders)
        .set({ stockDeducted: false, stockRestored: false, lineItems: o.lineItems.map((l) => ({ ...l, deductedQty: 0 })) })
        .where(eq(schema.shopifyOrders.id, o.id));
    }
  });
  console.log(`Done. Products adjusted: ${products.length}, units put back: ${unitsRestored}, orders marked: ${orders.length}`);
  await sqlc.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
