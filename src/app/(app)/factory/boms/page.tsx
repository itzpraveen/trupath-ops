import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { deleteBom } from "@/actions/materials";
import { db } from "@/db";
import { bomLines, boms, materials, products } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { canEdit } from "@/lib/permissions";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/app/confirm-action";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/app/data-table";

export const metadata: Metadata = { title: "Material recipes" };
const BRAND: Record<string, string> = { babygambling: "Baby Gambling", firstbon: "Firstbon" };

export default async function BomsPage() {
  const user = await requireUser("materials");
  const rows = await db
    .select({
      bom: boms,
      name: products.name,
      variant: products.variant,
      brandId: products.brandId,
      lines: sql<number>`count(${bomLines.id})::int`,
      cost: sql<number>`coalesce(sum(${bomLines.qtyPerUnit} * (1 + ${bomLines.wastagePct}/100) * ${materials.costP}),0)::float8`,
    })
    .from(boms)
    .innerJoin(products, eq(products.id, boms.productId))
    .leftJoin(bomLines, eq(bomLines.bomId, boms.id))
    .leftJoin(materials, eq(materials.id, bomLines.materialId))
    .groupBy(boms.id, products.name, products.variant, products.brandId)
    .orderBy(asc(products.name), asc(products.variant));
  const editable = canEdit(user.role, "materials");

  return (
    <>
      <PageHeader title="Material recipes" description="How much of each raw material goes into one finished piece. Production entries use these to deduct stock automatically." backHref="/factory/materials" backLabel="Raw materials">
        {editable ? (
          <Link href="/factory/boms/new" className={buttonVariants({ size: "sm" })}>
            <Plus /> New recipe
          </Link>
        ) : null}
      </PageHeader>
      {rows.length === 0 ? (
        <EmptyState title="No recipes yet" description="Start with your best sellers, for example the Nest Bed: mull, foam sheet, print fabric, zip, lace.">
          {editable ? (
            <Link href="/factory/boms/new" className={buttonVariants({ size: "sm" })}>
              Create the first recipe
            </Link>
          ) : null}
        </EmptyState>
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Version</TableHead>
                <TableHead className="text-right">Materials</TableHead>
                <TableHead className="text-right">Material cost / unit</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Labour / unit</TableHead>
                <TableHead>Status</TableHead>
                {editable ? <TableHead className="w-28" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ bom, name, variant, brandId, lines, cost }) => (
                <TableRow key={bom.id}>
                  <TableCell className="font-medium">
                    <Link href={`/factory/boms/${bom.id}`} className="hover:underline">
                      {name}
                      {variant ? ` — ${variant}` : ""}
                    </Link>
                  </TableCell>
                  <TableCell>{BRAND[brandId] ?? brandId}</TableCell>
                  <TableCell>{bom.version}</TableCell>
                  <TableCell className="tabular text-right">{lines}</TableCell>
                  <TableCell className="tabular text-right">{formatINR(Math.round(Number(cost)))}</TableCell>
                  <TableCell className="tabular hidden text-right sm:table-cell">{bom.labourCostP ? formatINR(bom.labourCostP) : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{bom.active ? "In use" : "Old version"}</TableCell>
                  {editable ? (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Link href={`/factory/boms/${bom.id}`} className={buttonVariants({ variant: "ghost", size: "xs" })}>
                          Edit
                        </Link>
                        <ConfirmAction trigger={<Button variant="ghost" size="xs" className="text-muted-foreground" />} title="Delete this recipe?" description="Past production entries keep their recorded material usage." action={deleteBom} hidden={{ id: bom.id }} confirmLabel="Delete" destructive>
                          Delete
                        </ConfirmAction>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </>
  );
}
