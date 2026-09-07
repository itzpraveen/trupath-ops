import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, count, eq, ilike, or, sql } from "drizzle-orm";
import { Download } from "lucide-react";
import { cn } from "cn";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { canEdit } from "@/lib/permissions";
import { getBrands } from "@/lib/queries/common";
import { int, pick, qs, str } from "@/lib/url";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/app/page-header";
import { Stat, StatGrid } from "@/components/app/stat";
import { StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCard, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/app/data-table";
import { StockMovementDialog } from "./stock-dialogs";

export const metadata: Metadata = { title: "Finished stock" };
const PAGE = 100;

export default async function StockPage(props: PageProps<"/stock">) {
  const user = await requireUser("stock");
  const sp = await props.searchParams;
  const brands = await getBrands();
  const brand = pick(sp.brand, ["all", ...brands.map((b) => b.id)], "all");
  const q = str(sp.q, 80);
  const low = sp.low === "1";
  const inStock = sp.instock === "1";
  const page = int(sp.page);
  const where = and(
    eq(products.active, true),
    brand === "all" ? undefined : eq(products.brandId, brand),
    q ? or(ilike(products.name, `%${q}%`), ilike(products.variant, `%${q}%`), ilike(products.sku, `%${q}%`), ilike(products.category, `%${q}%`)) : undefined,
    low ? sql`${products.minStock} > 0 and ${products.stockQty} <= ${products.minStock}` : undefined,
    inStock ? sql`${products.stockQty} > 0` : undefined,
  );
  const [rows, [{ total }], totals] = await Promise.all([
    db.select().from(products).where(where).orderBy(asc(products.brandId), asc(products.name), asc(products.variant)).limit(PAGE).offset((page - 1) * PAGE),
    db.select({ total: count() }).from(products).where(where),
    db
      .select({
        brandId: products.brandId,
        units: sql<number>`coalesce(sum(${products.stockQty}),0)::int`,
        value: sql<number>`coalesce(sum(${products.stockQty} * ${products.costP}),0)::float8`,
        low: sql<number>`count(*) filter (where ${products.minStock} > 0 and ${products.stockQty} <= ${products.minStock})::int`,
        skus: sql<number>`count(*) filter (where ${products.stockQty} > 0)::int`,
      })
      .from(products)
      .where(eq(products.active, true))
      .groupBy(products.brandId),
  ]);
  const sum = totals.reduce((a, t) => ({ units: a.units + Number(t.units), value: a.value + Number(t.value), low: a.low + Number(t.low), skus: a.skus + Number(t.skus) }), { units: 0, value: 0, low: 0, skus: 0 });
  const editable = canEdit(user.role, "stock");
  const brandName = Object.fromEntries(brands.map((b) => [b.id, b.name]));
  const params = { brand, q: q || undefined, low: low ? "1" : undefined, instock: inStock ? "1" : undefined };
  const pages = Math.max(1, Math.ceil(Number(total) / PAGE));

  return (
    <>
      <PageHeader title="Finished stock" description="Ready-to-sell pieces by brand. Production adds, dispatch and website orders take away.">
        <Link href="/products" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Manage products
        </Link>
        <Link href="/api/export/stock" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Download /> Export CSV
        </Link>
      </PageHeader>
      <StatGrid className="mb-5">
        <Stat label="Units in stock" value={sum.units} tone="primary" hint={totals.map((t) => `${brandName[t.brandId] ?? t.brandId} ${t.units}`).join(" · ")} />
        <Stat label="Products with stock" value={sum.skus} />
        <Stat label="Below minimum" value={sum.low} tone={sum.low ? "warning" : "default"} />
        <Stat label="Stock value" value={formatINR(Math.round(sum.value))} hint="at cost price" />
      </StatGrid>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
          {[["all", "All brands"], ...brands.map((b) => [b.id, b.name])].map(([v, l]) => (
            <Link key={v} href={`/stock${qs({ ...params, brand: v, page: undefined })}`} className={cn("rounded-md px-3 py-1", brand === v ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {l}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap items-center gap-2" action="/stock">
          <input type="hidden" name="brand" value={brand} />
          <Input name="q" defaultValue={q} placeholder="Search name, print, SKU…" className="w-52" />
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
          <Link href={`/stock${qs({ ...params, low: low ? undefined : "1", page: undefined })}`} className={cn("text-xs", low ? "text-warning" : "text-muted-foreground hover:text-foreground")}>
            {low ? "Showing low stock" : "Low stock only"}
          </Link>
          <Link href={`/stock${qs({ ...params, instock: inStock ? undefined : "1", page: undefined })}`} className={cn("text-xs", inStock ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
            {inStock ? "Showing in stock" : "In stock only"}
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
              <TableHead>Brand</TableHead>
              <TableHead className="text-right">In stock</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Min</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Shopify</TableHead>
              {editable ? <TableHead className="w-44" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={8}>No products match this filter.</TableEmpty>
            ) : (
              rows.map((p) => {
                const isLow = p.minStock > 0 && p.stockQty <= p.minStock;
                return (
                  <TableRow key={p.id}>
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
                        {p.variant || p.category || ""}
                        {p.sku ? <span className="md:hidden"> · {p.sku}</span> : null}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{p.sku ?? "—"}</TableCell>
                    <TableCell>{brandName[p.brandId] ?? p.brandId}</TableCell>
                    <TableCell className={cn("tabular text-right text-base font-semibold", isLow && "text-warning", p.stockQty === 0 && "text-muted-foreground")}>
                      {p.stockQty}
                      {isLow ? <StatusBadge tone="warning" className="ml-2 hidden sm:inline-flex">low</StatusBadge> : null}
                    </TableCell>
                    <TableCell className="tabular hidden text-right text-muted-foreground sm:table-cell">{p.minStock || "—"}</TableCell>
                    <TableCell className="tabular hidden text-right text-muted-foreground lg:table-cell">{p.shopifyQty ?? "—"}</TableCell>
                    {editable ? (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <StockMovementDialog product={p} kind="purchase_in" trigger={<Button variant="outline" size="xs" />} />
                          <StockMovementDialog product={p} kind="count" trigger={<Button variant="ghost" size="xs" />} />
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })
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
            {page > 1 ? <Link href={`/stock${qs({ ...params, page: page - 1 })}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Previous</Link> : null}
            {page < pages ? <Link href={`/stock${qs({ ...params, page: page + 1 })}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Next</Link> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
