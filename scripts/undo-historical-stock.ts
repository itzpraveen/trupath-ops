/**
 * One-off repair: website orders placed before the stock baseline (the moment the store was
 * connected) should never have changed finished stock. This puts back any deductions that were
 * applied to such orders and marks them so they are not deducted again.
 *
 * Usage: npm run stock:undo-import   (set STOCK_BASELINE=YYYY-MM-DDTHH:mm:ssZ to override the stored baseline)
 */
import "dotenv/config";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sqlc = postgres(url, { max: 1, ssl: process.env.DATABASE_SSL === "require" ? "require" : undefined });
  const db = drizzle(sqlc, { schema, casing: "snake_case" });

  let baseline: Date | null = process.env.STOCK_BASELINE ? new Date(process.env.STOCK_BASELINE) : null;
  if (!baseline) {
    const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, "shopify.stockBaselineAt")).limit(1);
    if (row && typeof row.value === "string") baseline = new Date(row.value);
  }
  if (!baseline || Number.isNaN(baseline.getTime())) throw new Error("No stock baseline found. Connect Shopify first or pass STOCK_BASELINE.");
  console.log("Stock baseline:", baseline.toISOString());

  const orders = await db
    .select({ id: schema.shopifyOrders.id, name: schema.shopifyOrders.name, lineItems: schema.shopifyOrders.lineItems })
    .from(schema.shopifyOrders)
    .where(and(lt(schema.shopifyOrders.createdAtShop, baseline), eq(schema.shopifyOrders.stockDeducted, true), eq(schema.shopifyOrders.stockRestored, false)));
  console.log(`Historical orders with stock deducted: ${orders.length}`);
  if (!orders.length) {
    await sqlc.end();
    return;
  }

  const perVariant = new Map<string, number>();
  for (const o of orders) for (const l of o.lineItems) if (l.variantId && l.quantity > 0) perVariant.set(l.variantId, (perVariant.get(l.variantId) ?? 0) + l.quantity);
  const variantIds = [...perVariant.keys()];
  const products = variantIds.length ? await db.select({ id: schema.products.id, name: schema.products.name, variant: schema.products.variant, shopifyVariantId: schema.products.shopifyVariantId, stockQty: schema.products.stockQty }).from(schema.products).where(inArray(schema.products.shopifyVariantId, variantIds)) : [];

  let unitsRestored = 0;
  await db.transaction(async (tx) => {
    for (const p of products) {
      const qty = perVariant.get(p.shopifyVariantId!) ?? 0;
      if (!qty) continue;
      const [locked] = await tx.select({ stockQty: schema.products.stockQty }).from(schema.products).where(eq(schema.products.id, p.id)).for("update");
      const before = locked.stockQty;
      const after = before + qty;
      await tx.update(schema.products).set({ stockQty: after }).where(eq(schema.products.id, p.id));
      await tx.insert(schema.stockMovements).values({ productId: p.id, kind: "adjustment", qty, beforeQty: before, afterQty: after, refType: "shopify_baseline", refId: baseline!.toISOString().slice(0, 10), note: `Undo deductions from ${orders.length} website orders placed before the store was connected` });
      unitsRestored += qty;
      console.log(`  ${p.name}${p.variant ? ` — ${p.variant}` : ""}: ${before} → ${after}`);
    }
    await tx.update(schema.shopifyOrders).set({ stockDeducted: false }).where(sql`${schema.shopifyOrders.id} in ${orders.map((o) => o.id)}`);
  });
  console.log(`Done. Products adjusted: ${products.length}, units put back: ${unitsRestored}, orders marked: ${orders.length}`);
  await sqlc.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
