import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, count, eq, ilike, or } from "drizzle-orm";
import { cn } from "cn";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { canEdit } from "@/lib/permissions";
import { getBrands } from "@/lib/queries/common";
import { isShopifyConfigured } from "@/lib/shopify";
import { int, pick, qs, str } from "@/lib/url";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCard, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/app/data-table";
import { ProductDialog } from "../stock/stock-dialogs";
import { SyncButton } from "../orders/sync-button";
import { isCompleteFeedingPillow } from "@/lib/product-tax";

export const metadata: Metadata = { title: "Products" };
const PAGE = 100;

export default async function ProductsPage(props: PageProps<"/products">) {
  const user = await requireUser("products");
  const sp = await props.searchParams;
  const brands = await getBrands();
  const brand = pick(sp.brand, ["all", ...brands.map((b) => b.id)], "all");
  const q = str(sp.q, 80);
  const showAll = sp.all === "1";
  const page = int(sp.page);
  const where = and(
    showAll ? undefined : eq(products.active, true),
    brand === "all" ? undefined : eq(products.brandId, brand),
    q ? or(ilike(products.name, `%${q}%`), ilike(products.variant, `%${q}%`), ilike(products.sku, `%${q}%`), ilike(products.category, `%${q}%`)) : undefined,
  );
  const [rows, [{ total }], cats] = await Promise.all([
    db.select().from(products).where(where).orderBy(asc(products.brandId), asc(products.name), asc(products.variant)).limit(PAGE).offset((page - 1) * PAGE),
    db.select({ total: count() }).from(products).where(where),
    db.selectDistinct({ category: products.category }).from(products).where(eq(products.active, true)).orderBy(asc(products.category)),
  ]);
  const categories = cats.map((c) => c.category).filter((c): c is string => !!c);
  const editable = canEdit(user.role, "products");
  const brandName = Object.fromEntries(brands.map((b) => [b.id, b.name]));
  const params = { brand, q: q || undefined, all: showAll ? "1" : undefined };
  const pages = Math.max(1, Math.ceil(Number(total) / PAGE));
  const shopifyOn = await isShopifyConfigured();

  return (
    <>
      <PageHeader title="Products" description="The catalogue for both brands. Baby Gambling products come from Shopify; add Firstbon and other products by hand.">
        <Link href={`/products/catalogue${brand !== "all" ? `?brand=${brand}` : ""}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Supplied catalogue</Link>
        {editable ? <ProductDialog brands={brands} categories={categories} /> : null}
        {editable && shopifyOn ? <SyncButton label="Refresh from Shopify" /> : null}
      </PageHeader>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
          {[["all", "All brands"], ...brands.map((b) => [b.id, b.name])].map(([v, l]) => (
            <Link key={v} href={`/products${qs({ ...params, brand: v, page: undefined })}`} className={cn("rounded-md px-3 py-1", brand === v ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {l}
            </Link>
          ))}
        </div>
        <form className="flex items-center gap-2" action="/products">
          <input type="hidden" name="brand" value={brand} />
          {showAll ? <input type="hidden" name="all" value="1" /> : null}
          <Input name="q" defaultValue={q} placeholder="Search name, print, SKU…" className="w-52" />
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
          <Link href={`/products${qs({ ...params, all: showAll ? undefined : "1", page: undefined })}`} className="text-xs text-muted-foreground hover:text-foreground">
            {showAll ? "Hide inactive" : "Show inactive"}
          </Link>
        </form>
      </div>
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12" />
              <TableHead>Product</TableHead>
              <TableHead className="hidden md:table-cell">SKU</TableHead>
              <TableHead className="hidden lg:table-cell">Category</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Cost</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Min</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              {editable ? <TableHead className="w-16" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={10}>No products match.</TableEmpty>
            ) : (
              rows.map((p) => (
                <TableRow key={p.id} className={cn(!p.active && "opacity-60")}>
                  <TableCell className="pr-0">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="size-9 rounded-md object-cover" loading="lazy" />
                    ) : (
                      <div className="size-9 rounded-md bg-muted" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Link href={`/stock/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {p.variant}
                      {p.source === "shopify" ? (
                        <StatusBadge tone="info" className="ml-1 h-5 px-1.5 text-[10px]">
                          Shopify
                        </StatusBadge>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">HSN {p.hsnCode || "missing"} · GST {p.gstRate === null ? "missing" : `${p.gstRate}%`}</span>
                    {p.requiresComponentBilling || isCompleteFeedingPillow(p.name, p.variant) ? <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">Cover/inner billing amounts needed</span> : null}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{p.sku ?? "—"}</TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{p.category ?? "—"}</TableCell>
                  <TableCell>{brandName[p.brandId] ?? p.brandId}</TableCell>
                  <TableCell className="tabular text-right">{p.priceP ? formatINR(p.priceP) : "—"}</TableCell>
                  <TableCell className="tabular hidden text-right sm:table-cell">{p.costP ? formatINR(p.costP) : "—"}</TableCell>
                  <TableCell className="tabular hidden text-right text-muted-foreground sm:table-cell">{p.minStock || "—"}</TableCell>
                  <TableCell className="tabular text-right font-medium">{p.stockQty}</TableCell>
                  {editable ? (
                    <TableCell className="text-right">
                      <ProductDialog product={p} brands={brands} categories={categories} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableCard>
      {pages > 1 ? (
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {Number(total)} products · page {page} of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? <Link href={`/products${qs({ ...params, page: page - 1 })}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Previous</Link> : null}
            {page < pages ? <Link href={`/products${qs({ ...params, page: page + 1 })}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Next</Link> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
