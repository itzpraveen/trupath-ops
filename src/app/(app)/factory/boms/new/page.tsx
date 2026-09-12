import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bomLines, boms } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getMaterials, getProductOptions } from "@/lib/queries/common";
import { PageHeader } from "@/components/app/page-header";
import { BomForm } from "../bom-form";

export const metadata: Metadata = { title: "New recipe" };

/** V1, V2, V3 … the next unused version for this product. */
function nextVersion(existing: string[]) {
  const highest = existing.reduce((n, v) => Math.max(n, Number(/^V(\d+)$/i.exec(v)?.[1] ?? 0)), 0);
  return `V${highest + 1}`;
}

export default async function NewBomPage(props: PageProps<"/factory/boms/new">) {
  await requireUser("materials");
  const sp = await props.searchParams;
  const from = typeof sp.from === "string" && /^[0-9a-f-]{36}$/i.test(sp.from) ? sp.from : null;
  const [products, materials] = await Promise.all([getProductOptions(), getMaterials()]);

  let initial: React.ComponentProps<typeof BomForm>["initial"];
  if (from) {
    const [source] = await db.select().from(boms).where(eq(boms.id, from)).limit(1);
    if (source) {
      const [lines, siblings] = await Promise.all([
        db.select().from(bomLines).where(eq(bomLines.bomId, from)).orderBy(asc(bomLines.id)),
        db.select({ version: boms.version }).from(boms).where(eq(boms.productId, source.productId)),
      ]);
      initial = {
        productId: source.productId,
        version: nextVersion(siblings.map((s) => s.version)),
        labourCostP: source.labourCostP,
        note: source.note,
        lines: lines.map((l) => ({ materialId: l.materialId, qtyPerUnit: l.qtyPerUnit, wastagePct: l.wastagePct })),
      };
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={initial ? "Copy recipe" : "New recipe"}
        description={initial ? "A copy of the current recipe as a new version. Saving it makes it the one production uses." : "Quantities are per one finished piece. Add wastage for fabric that is cut away."}
        backHref="/factory/boms"
        backLabel="Material recipes"
      />
      <BomForm products={products} materials={materials} initial={initial} />
    </div>
  );
}
