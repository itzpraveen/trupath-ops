import { beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
const actor = vi.hoisted(() => {
  // Synthetic amounts: real workbook prices stay out of the public repository and CI.
  process.env.PRODUCT_CATALOGUE_PRICES_JSON = JSON.stringify({
    "stk-3": { purchasePriceP: 12345, salePriceP: 67890 },
    "stk-4": { purchasePriceP: 23456, salePriceP: 78900 },
  });
  return { id: "", allowed: true };
});
vi.mock("@/lib/auth", () => ({ requireEditor: async () => { if (!actor.allowed) throw new Error("You do not have permission to do that."); return actor; } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { db } from "@/db";
import { auditLog, brands, products, users } from "@/db/schema";
import { applyCatalogueMappings, catalogueProductRevision } from "@/lib/catalogue-import";
import { applySuppliedCatalogue } from "@/actions/product-catalogue";
import { upsertProductFromShopify } from "@/lib/shopify";
import type { StoreAuth } from "@/lib/shopify-oauth";

let brand: string;
beforeAll(async () => {
  brand = `catalogue-${randomUUID().slice(0, 8)}`;
  await db.insert(brands).values({ id: brand, name: "Catalogue test" });
  actor.id = (await db.select().from(users).where(eq(users.role, "owner")).limit(1))[0].id;
});
const product = async (name = "Catalogue product", extra: Partial<typeof products.$inferInsert> = {}) => (await db.insert(products).values({ brandId: brand, name, ...extra }).returning())[0];
const read = async (id: string) => (await db.select().from(products).where(eq(products.id, id)))[0];
const mapping = (p: typeof products.$inferSelect, ref: string) => ({ productId: p.id, ref, revision: catalogueProductRevision(p) });
const apply = (mappings: Parameters<typeof applyCatalogueMappings>[0]["mappings"], extra = {}) => applyCatalogueMappings({ brandId: brand, userId: actor.id, mappings, applyCosts: false, applyManualPrices: false, ...extra });

describe("catalogue application", () => {
  it("applies HSN/GST without changing identity, stock or Shopify prices, and is repeatable", async () => {
    const p = await product("Baby Blanket Choco Sky", { source: "shopify", sku: "KEEP-SKU", shopifyVariantId: randomUUID(), stockQty: 27, priceP: 120000, costP: 42000 });
    expect(await apply([mapping(p, "stk-2")])).toEqual({ updated: 1 });
    const after = await read(p.id);
    expect(after).toMatchObject({ id: p.id, name: p.name, sku: p.sku, shopifyVariantId: p.shopifyVariantId, stockQty: 27, priceP: 120000, costP: 42000, hsnCode: "5811", gstRate: 5, catalogueRef: "stk-2", hsnLocked: true });
    expect(await apply([mapping(after, "stk-2")])).toEqual({ updated: 0 });
    const logs = await db.select().from(auditLog).where(and(eq(auditLog.entityId, p.id), eq(auditLog.action, "apply_catalogue")));
    expect(logs).toHaveLength(1);
    expect(logs[0].meta).toMatchObject({ source: "Stknew.edited.xlsx", row: 2 });
  });
  it("rolls back the whole batch if a product changes after review", async () => {
    const first = await product(), second = await product();
    await db.update(products).set({ gstRate: 18 }).where(eq(products.id, second.id));
    await expect(apply([mapping(first, "stk-3"), mapping(second, "stk-4")])).rejects.toThrow(/changed after/);
    expect((await read(first.id)).catalogueRef).toBeNull();
    expect(await db.select().from(auditLog).where(eq(auditLog.entityId, first.id))).toHaveLength(0);
  });
  it("rejects another brand, duplicate targets and duplicate source assignments", async () => {
    const other = await product("Other brand", { brandId: "firstbon" });
    await expect(apply([mapping(other, "stk-3")])).rejects.toThrow(/unavailable in this brand/);
    const p = await product();
    await expect(apply([mapping(p, "stk-3"), mapping(p, "stk-4")])).rejects.toThrow(/different product/);
    await expect(apply([mapping(p, "stk-2")])).rejects.toThrow(/already linked/);
  });
  it("preserves missing GST and prices instead of substituting zero", async () => {
    const p = await product("Basket", { gstRate: 12, priceP: 32100, costP: 12300 });
    await apply([mapping(p, "stk-38")], { applyCosts: true, applyManualPrices: true });
    expect(await read(p.id)).toMatchObject({ gstRate: 12, priceP: 32100, costP: 12300, hsnCode: "5811" });
  });
  it("applies selected reference prices only to the intended cost/manual price fields", async () => {
    const manual = await product(), web = await product("Web", { source: "shopify", priceP: 77700 });
    await apply([mapping(manual, "stk-3"), mapping(web, "stk-4")], { applyCosts: true, applyManualPrices: true });
    expect(await read(manual.id)).toMatchObject({ costP: 12345, priceP: 67890 });
    expect(await read(web.id)).toMatchObject({ costP: 23456, priceP: 77700 });
  });
  it("sets the feeding pillow hold without guessing the component amounts", async () => {
    const p = await product("CUTE SKY WHITE FEEDING PILLOW");
    await apply([mapping(p, "stk-48")]);
    expect(await read(p.id)).toMatchObject({ gstRate: 18, requiresComponentBilling: true, priceP: 0, costP: 0 });
  });
  it("serializes competing links to a single source row", async () => {
    const a = await product(), b = await product();
    const results = await Promise.allSettled([apply([mapping(a, "stk-5")]), apply([mapping(b, "stk-5")])]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(products).where(and(eq(products.brandId, brand), eq(products.catalogueRef, "stk-5")))).toHaveLength(1);
  });
  it("keeps supplied HSN/GST during Shopify refresh while refreshing the selling price", async () => {
    const variantId = String(Date.now());
    const p = await product("Baby Blanket Dreamy Night", { source: "shopify", shopifyVariantId: variantId });
    await apply([mapping(p, "stk-6")]);
    const auth = { brandId: brand } as StoreAuth;
    await upsertProductFromShopify({ id: "gid://shopify/Product/123", title: "Baby Blanket Dreamy Night updated", productType: "Blanket", status: "ACTIVE", featuredMedia: null,
      variants: { nodes: [{ id: `gid://shopify/ProductVariant/${variantId}`, title: "Default Title", sku: "NEW-SKU", price: "1399", inventoryQuantity: 6, image: null, inventoryItem: { id: "gid://shopify/InventoryItem/123", tracked: true, harmonizedSystemCode: "999999" } }] } }, auth);
    expect(await read(p.id)).toMatchObject({ hsnCode: "5811", gstRate: 5, catalogueRef: "stk-6", priceP: 139900, stockQty: 0, shopifyQty: 6 });
  });
  it("requires editor authorization on the public server action", async () => {
    actor.allowed = false;
    try { expect((await applySuppliedCatalogue(null, new FormData()))?.error).toMatch(/permission/); }
    finally { actor.allowed = true; }
  });
});
