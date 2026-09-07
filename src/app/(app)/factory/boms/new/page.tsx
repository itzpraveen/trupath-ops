import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getMaterials, getProductOptions } from "@/lib/queries/common";
import { PageHeader } from "@/components/app/page-header";
import { BomForm } from "../bom-form";

export const metadata: Metadata = { title: "New recipe" };

export default async function NewBomPage() {
  await requireUser("materials");
  const [products, materials] = await Promise.all([getProductOptions(), getMaterials()]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="New recipe" description="Quantities are per one finished piece. Add wastage for fabric that is cut away." backHref="/factory/boms" backLabel="Material recipes" />
      <BomForm products={products} materials={materials} />
    </div>
  );
}
