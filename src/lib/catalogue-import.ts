import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, type Product } from "@/db/schema";
import { audit } from "@/lib/audit";
import { catalogueEntry, suppliedCatalogue } from "@/lib/catalogue-data";

export function catalogueProductRevision(product: Product) {
  return createHash("sha256").update(JSON.stringify([
    product.id, product.brandId, product.name, product.variant, product.sku, product.active,
    product.source, product.hsnCode, product.gstRate, product.catalogueRef, product.hsnLocked,
    product.requiresComponentBilling, product.priceP, product.costP,
  ])).digest("hex");
}

export type CatalogueMapping = { ref: string; productId: string; revision: string };

export async function applyCatalogueMappings(input: {
  brandId: string; mappings: CatalogueMapping[]; userId: string; applyCosts: boolean; applyManualPrices: boolean;
}) {
  if (!input.mappings.length || input.mappings.length > suppliedCatalogue.entries.length) throw new Error("Choose at least one product to update.");
  if (new Set(input.mappings.map((item) => item.ref)).size !== input.mappings.length || new Set(input.mappings.map((item) => item.productId)).size !== input.mappings.length) {
    throw new Error("Each catalogue entry must match a different product. Review the repeated selections.");
  }
  return db.transaction(async (tx) => {
    // Serialize assignments for this brand, including two users linking the same source row.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`catalogue:${input.brandId}`}, 0))`);
    const targets = await tx.select().from(products)
      .where(and(eq(products.brandId, input.brandId), inArray(products.id, input.mappings.map((item) => item.productId))))
      .orderBy(asc(products.id)).for("update");
    const existingLinks = await tx.select({ id: products.id, ref: products.catalogueRef }).from(products)
      .where(and(eq(products.brandId, input.brandId), inArray(products.catalogueRef, input.mappings.map((item) => item.ref))));
    let updated = 0;
    for (const mapping of input.mappings) {
      const entry = catalogueEntry(mapping.ref);
      const product = targets.find((target) => target.id === mapping.productId);
      if (!entry || !product || !product.active) throw new Error("A selected product or catalogue entry is unavailable in this brand. Reload and match it again.");
      if (catalogueProductRevision(product) !== mapping.revision) throw new Error(`${product.name} changed after this review. Reload the catalogue before applying it.`);
      if (existingLinks.some((link) => link.ref === entry.ref && link.id !== product.id)) throw new Error(`${entry.name} is already linked to another product in this brand.`);
      if (product.catalogueRef && product.catalogueRef !== entry.ref) throw new Error(`${product.name} is already linked to a different catalogue entry.`);
      const values = {
        catalogueRef: entry.ref,
        hsnCode: entry.hsnCode,
        hsnLocked: true,
        // An unanswered rate must not erase an existing value or become zero.
        gstRate: entry.gstRate ?? product.gstRate,
        requiresComponentBilling: entry.requiresComponentBilling || product.requiresComponentBilling,
        costP: input.applyCosts && entry.purchasePriceP !== null ? entry.purchasePriceP : product.costP,
        priceP: input.applyManualPrices && product.source === "manual" && entry.salePriceP !== null ? entry.salePriceP : product.priceP,
      };
      if (Object.entries(values).every(([key, value]) => product[key as keyof Product] === value)) continue;
      await tx.update(products).set(values).where(eq(products.id, product.id));
      await audit(tx, {
        userId: input.userId, action: "apply_catalogue", entityType: "product", entityId: product.id,
        summary: `Applied supplied HSN/GST details to ${product.name}`,
        meta: { source: suppliedCatalogue.source, sheet: suppliedCatalogue.sheet, row: entry.row, providedOn: suppliedCatalogue.providedOn,
          before: { hsnCode: product.hsnCode, gstRate: product.gstRate, catalogueRef: product.catalogueRef, requiresComponentBilling: product.requiresComponentBilling, costP: product.costP, priceP: product.priceP }, after: values },
      });
      updated++;
    }
    return { updated };
  });
}
