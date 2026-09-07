import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { cn } from "cn";
import { db } from "@/db";
import { products, stockMovements, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { canEdit } from "@/lib/permissions";
import { getBrands } from "@/lib/queries/common";
import { Button } from "@/components/ui/button";
import { PageHeader, Section } from "@/components/app/page-header";
import { Stat, StatGrid } from "@/components/app/stat";
import { Table, TableBody, TableCard, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/app/data-table";
import { ProductDialog, StockMovementDialog } from "../stock-dialogs";

export const metadata: Metadata = { title: "Product stock" };
const KIND_LABEL: Record<string, string> = { production_in: "Produced", purchase_in: "Stock in", jobwork_in: "From job work", return_in: "Returned", sale_out: "Website order", dispatch_out: "Dispatched", adjustment: "Adjustment", count: "Stock count" };

export default async function ProductStockPage(props: PageProps<"/stock/[id]">) {
  const user = await requireUser("stock");
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [p] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!p) notFound();
  const [moves, brands] = await Promise.all([
    db.select({ mv: stockMovements, userName: users.name }).from(stockMovements).leftJoin(users, eq(users.id, stockMovements.userId)).where(eq(stockMovements.productId, id)).orderBy(desc(stockMovements.createdAt)).limit(200),
    getBrands(),
  ]);
  const editable = canEdit(user.role, "stock");
  const brandName = brands.find((b) => b.id === p.brandId)?.name ?? p.brandId;
  const isLow = p.minStock > 0 && p.stockQty <= p.minStock;

  return (
    <>
      <PageHeader title={`${p.name}${p.variant ? ` — ${p.variant}` : ""}`} description={`${brandName}${p.sku ? ` · SKU ${p.sku}` : ""}${p.category ? ` · ${p.category}` : ""}`} backHref="/stock" backLabel="Finished stock">
        {editable ? (
          <>
            <StockMovementDialog product={p} kind="purchase_in" trigger={<Button size="sm" />} />
            <StockMovementDialog product={p} kind="return_in" trigger={<Button variant="outline" size="sm" />} />
            <StockMovementDialog product={p} kind="adjustment" trigger={<Button variant="outline" size="sm" />} />
            <StockMovementDialog product={p} kind="count" trigger={<Button variant="outline" size="sm" />} />
          </>
        ) : null}
        {canEdit(user.role, "products") ? <ProductDialog product={p} brands={brands} categories={[]} trigger={<Button variant="ghost" size="sm" />} /> : null}
      </PageHeader>
      <div className="mb-6 flex gap-4">
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt="" className="hidden size-28 rounded-xl object-cover sm:block" />
        ) : null}
        <StatGrid className="flex-1">
          <Stat label="In stock" value={p.stockQty} tone={isLow ? "warning" : "primary"} hint={p.minStock ? `minimum ${p.minStock}` : "no minimum set"} />
          <Stat label="Selling price" value={p.priceP ? formatINR(p.priceP) : "—"} />
          <Stat label="Cost per piece" value={p.costP ? formatINR(p.costP) : "—"} hint={p.costP && p.priceP ? `margin ${Math.round(((p.priceP - p.costP) / p.priceP) * 100)}%` : undefined} />
          <Stat label="Shopify quantity" value={p.shopifyQty ?? "—"} hint={p.source === "shopify" ? "from last sync" : "not a website product"} />
        </StatGrid>
      </div>
      <Section title="History">
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>What</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Balance</TableHead>
                <TableHead className="hidden md:table-cell">Reference</TableHead>
                <TableHead className="hidden lg:table-cell">By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {moves.length === 0 ? (
                <TableEmpty colSpan={6}>No stock movements yet.</TableEmpty>
              ) : (
                moves.map(({ mv, userName }) => (
                  <TableRow key={mv.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(mv.createdAt)}</TableCell>
                    <TableCell>
                      {KIND_LABEL[mv.kind] ?? mv.kind}
                      {mv.note ? <span className="block max-w-72 truncate text-xs text-muted-foreground">{mv.note}</span> : null}
                    </TableCell>
                    <TableCell className={cn("tabular text-right font-medium", mv.qty > 0 ? "text-success" : mv.qty < 0 ? "text-destructive" : "")}>
                      {mv.qty > 0 ? "+" : ""}
                      {mv.qty}
                    </TableCell>
                    <TableCell className="tabular hidden text-right sm:table-cell">{mv.afterQty}</TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{mv.refId ?? ""}</TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{userName ?? (mv.refType === "shopify_order" ? "Website" : "—")}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableCard>
      </Section>
    </>
  );
}
