import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { getBrands } from "@/lib/queries/common";
import { catalogueProductRevision } from "@/lib/catalogue-import";
import { suppliedCatalogue } from "@/lib/catalogue-data";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { CatalogueReview } from "./review";

export const metadata: Metadata = { title: "Supplied product catalogue" };

export default async function CataloguePage(props: PageProps<"/products/catalogue">) {
  const user = await requireUser("products");
  const brands = await getBrands();
  const sp = await props.searchParams;
  const brand = brands.find((item) => item.id === sp.brand);
  const rows = brand ? await db.select().from(products).where(and(eq(products.brandId, brand.id), eq(products.active, true)))
    .orderBy(asc(products.name), asc(products.variant)) : [];
  const options = rows.map((product) => ({
    id: product.id, name: product.name, variant: product.variant, sku: product.sku, brandId: product.brandId,
    stockQty: product.stockQty, unit: product.unit, priceP: product.priceP, costP: product.costP,
    hsnCode: product.hsnCode, gstRate: product.gstRate, catalogueRef: product.catalogueRef,
    requiresComponentBilling: product.requiresComponentBilling, revision: catalogueProductRevision(product),
  }));
  return <>
    <PageHeader title="Supplied product catalogue" description="Match the supplied product details to your existing catalogue, then review the HSN and GST changes.">
      <Link href="/products" className={buttonVariants({ variant: "outline", size: "sm" })}>Back to products</Link>
    </PageHeader>
    <p className="mb-3 text-sm text-muted-foreground">{suppliedCatalogue.source} · 10 September 2026 · {suppliedCatalogue.entries.length} product entries. Purchase and selling prices are reference amounts until their tax basis is confirmed.</p>
    <nav aria-label="Catalogue brand" className="mb-5 flex flex-wrap gap-2">
      {brands.map((item) => <Link key={item.id} href={`/products/catalogue?brand=${item.id}`} aria-current={brand?.id === item.id ? "page" : undefined}
        className={buttonVariants({ variant: brand?.id === item.id ? "default" : "outline", size: "sm" })}>{item.name}</Link>)}
    </nav>
    {!brand ? <p>Choose the brand whose products you want to match.</p> : <CatalogueReview key={options.map((product) => product.revision).join("")} entries={suppliedCatalogue.entries} brandId={brand.id} products={options} editable={canEdit(user.role, "products")} />}
    <p className="mt-5 text-xs text-muted-foreground">The FLIP BED label in row 54 may be a section heading and is excluded pending clarification. Basket GST was not supplied. Missing prices remain blank.</p>
  </>;
}
