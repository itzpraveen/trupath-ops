import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bomLines, boms } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getMaterials, getProductOptions } from "@/lib/queries/common";
import { PageHeader } from "@/components/app/page-header";
import { BomForm } from "../bom-form";

export const metadata: Metadata = { title: "Edit recipe" };

export default async function EditBomPage(props: PageProps<"/factory/boms/[id]">) {
  await requireUser("materials");
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [bom] = await db.select().from(boms).where(eq(boms.id, id)).limit(1);
  if (!bom) notFound();
  const [lines, products, materials] = await Promise.all([db.select().from(bomLines).where(eq(bomLines.bomId, id)), getProductOptions(), getMaterials()]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Edit recipe" description="Changes apply to production recorded from now on." backHref="/factory/boms" backLabel="Material recipes" />
      <BomForm products={products} materials={materials} initial={{ id: bom.id, productId: bom.productId, version: bom.version, labourCostP: bom.labourCostP, note: bom.note, lines: lines.map((l) => ({ materialId: l.materialId, qtyPerUnit: l.qtyPerUnit, wastagePct: l.wastagePct })) }} />
    </div>
  );
}
