import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { deleteBom, setBomActive } from "@/actions/materials";
import { db } from "@/db";
import { bomLines, boms, materials, products } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { BRAND_LABEL } from "@/lib/constants";
import { formatINR } from "@/lib/money";
import { canEdit } from "@/lib/permissions";
import { maxMakeable, type RecipeLine } from "@/lib/production-plan";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/app/confirm-action";
import { EmptyState } from "@/components/app/empty-state";
import { InlineAction } from "@/components/app/inline-action";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/app/data-table";

export const metadata: Metadata = { title: "Material recipes" };

export default async function BomsPage() {
  const user = await requireUser("materials");
  const [rows, lineRows] = await Promise.all([
    db
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
      .orderBy(asc(products.name), asc(products.variant)),
    db
      .select({ bomId: bomLines.bomId, materialId: bomLines.materialId, qtyPerUnit: bomLines.qtyPerUnit, wastagePct: bomLines.wastagePct, name: materials.name, unit: materials.unit, costP: materials.costP, inStock: materials.qty })
      .from(bomLines)
      .innerJoin(materials, eq(materials.id, bomLines.materialId)),
  ]);
  const byBom = new Map<string, RecipeLine[]>();
  for (const { bomId, ...line } of lineRows) byBom.set(bomId, [...(byBom.get(bomId) ?? []), line]);
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
                <TableHead className="hidden sm:table-cell">Brand</TableHead>
                <TableHead>Version</TableHead>
                <TableHead className="text-right">Material cost / unit</TableHead>
                <TableHead className="hidden text-right md:table-cell">Labour / unit</TableHead>
                <TableHead className="text-right">Stock covers</TableHead>
                <TableHead>Status</TableHead>
                {editable ? <TableHead className="w-52" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ bom, name, variant, brandId, lines, cost }) => {
                const recipeLines = byBom.get(bom.id) ?? [];
                const canMake = maxMakeable(recipeLines);
                return (
                  <TableRow key={bom.id}>
                    <TableCell className="font-medium">
                      <Link href={`/factory/boms/${bom.id}`} className="hover:underline">
                        {name}
                        {variant ? ` — ${variant}` : ""}
                      </Link>
                      <span className="block text-xs font-normal text-muted-foreground">
                        {lines} {lines === 1 ? "material" : "materials"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{BRAND_LABEL[brandId] ?? brandId}</TableCell>
                    <TableCell>{bom.version}</TableCell>
                    <TableCell className="tabular text-right">{formatINR(Math.round(Number(cost)))}</TableCell>
                    <TableCell className="tabular hidden text-right md:table-cell">{bom.labourCostP ? formatINR(bom.labourCostP) : "—"}</TableCell>
                    <TableCell className="tabular text-right">
                      {recipeLines.length ? (
                        <>
                          {canMake}
                          <span className="block text-xs font-normal text-muted-foreground">pieces</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{bom.active ? <StatusBadge tone="success">In use</StatusBadge> : <StatusBadge tone="neutral">Not in use</StatusBadge>}</TableCell>
                    {editable ? (
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1">
                          <Link href={`/factory/boms/${bom.id}`} className={buttonVariants({ variant: "ghost", size: "xs" })}>
                            Edit
                          </Link>
                          <Link href={`/factory/boms/new?from=${bom.id}`} className={buttonVariants({ variant: "ghost", size: "xs" })}>
                            Copy
                          </Link>
                          <InlineAction action={setBomActive} hidden={{ id: bom.id, active: bom.active ? "0" : "1" }} variant="outline">
                            {bom.active ? "Stop using" : "Use this"}
                          </InlineAction>
                          <ConfirmAction trigger={<Button variant="ghost" size="xs" className="text-muted-foreground" />} title="Delete this recipe?" description="Past production entries keep their recorded material usage." action={deleteBom} hidden={{ id: bom.id }} confirmLabel="Delete" destructive>
                            Delete
                          </ConfirmAction>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableCard>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Only the recipe marked <strong>In use</strong> deducts materials when production is recorded. Copy a recipe to change quantities without losing what past batches used.</p>
    </>
  );
}
