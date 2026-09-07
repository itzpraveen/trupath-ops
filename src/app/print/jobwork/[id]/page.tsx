import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, entities, jobWorkMaterials, jobWorkOrders, materials, products } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { formatINR, formatQty } from "@/lib/money";
import { PrintButton } from "../../print-button";

export default async function JobWorkChallanPage(props: PageProps<"/print/jobwork/[id]">) {
  await requireUser("jobwork");
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [row] = await db
    .select({ o: jobWorkOrders, vendor: contacts, productName: products.name, productVariant: products.variant })
    .from(jobWorkOrders)
    .innerJoin(contacts, eq(contacts.id, jobWorkOrders.vendorId))
    .leftJoin(products, eq(products.id, jobWorkOrders.productId))
    .where(eq(jobWorkOrders.id, id))
    .limit(1);
  if (!row) notFound();
  const { o, vendor } = row;
  const [mats, [entity]] = await Promise.all([
    db.select({ m: jobWorkMaterials, name: materials.name, unit: materials.unit, costP: materials.costP }).from(jobWorkMaterials).innerJoin(materials, eq(materials.id, jobWorkMaterials.materialId)).where(eq(jobWorkMaterials.orderId, id)).orderBy(asc(materials.code)),
    db.select().from(entities).where(eq(entities.id, o.entityId)).limit(1),
  ]);
  return (
    <div className="text-sm">
      <PrintButton />
      <div className="flex items-start justify-between border-b-2 border-black pb-4">
        <div>
          <h1 className="text-xl font-bold">{entity?.legalName ?? entity?.name ?? "Trupaths Ventures LLP"}</h1>
          {entity?.address ? <p className="whitespace-pre-line">{entity.address}</p> : null}
          {entity?.gstin ? <p>GSTIN {entity.gstin}</p> : null}
          {entity?.phone ? <p>{entity.phone}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">Job work challan</p>
          <p>{o.number}</p>
          <p>{formatDate(o.workDate)}</p>
          {o.dueDate ? <p>Due back {formatDate(o.dueDate)}</p> : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6 py-4">
        <div>
          <p className="font-semibold">Job worker</p>
          <p>{vendor.name}</p>
          {vendor.phone ? <p>{vendor.phone}</p> : null}
          {vendor.gstin ? <p>GSTIN {vendor.gstin}</p> : null}
          {vendor.address ? <p className="whitespace-pre-line">{vendor.address}</p> : null}
        </div>
        <div>
          <p className="font-semibold">Work</p>
          <p>
            {o.process}
            {row.productName ? ` · ${row.productName}${row.productVariant ? ` — ${row.productVariant}` : ""}` : ""}
          </p>
          <p>Quantity: {o.orderedQty}</p>
          {o.ratePerUnitP ? <p>Rate: {formatINR(o.ratePerUnitP)} per piece{o.taxBps ? ` + ${o.taxBps / 100}% GST` : ""}</p> : null}
          {o.description ? <p className="mt-1">{o.description}</p> : null}
        </div>
      </div>
      <p className="font-semibold">Materials sent (returnable)</p>
      <table className="mt-1 w-full border-collapse">
        <thead>
          <tr className="border-y border-black text-left">
            <th className="py-1.5 pr-2">#</th>
            <th className="py-1.5 pr-2">Material</th>
            <th className="py-1.5 text-right">Quantity</th>
            <th className="py-1.5 text-right">Approx. value</th>
          </tr>
        </thead>
        <tbody>
          {mats.length === 0 ? (
            <tr>
              <td className="py-2 text-gray-600" colSpan={4}>
                No materials sent with this order.
              </td>
            </tr>
          ) : (
            mats.map(({ m, name, unit, costP }, i) => (
              <tr key={m.id} className="border-b border-gray-300">
                <td className="py-1.5 pr-2">{i + 1}</td>
                <td className="py-1.5 pr-2">{name}</td>
                <td className="py-1.5 text-right">{formatQty(m.qtySent, unit)}</td>
                <td className="py-1.5 text-right">{formatINR(Math.round(m.qtySent * costP))}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {o.note ? <p className="mt-3 whitespace-pre-line text-gray-700">{o.note}</p> : null}
      <p className="mt-4 text-xs text-gray-600">Goods sent for job work. Ownership remains with the sender. Unused material to be returned with the finished goods.</p>
      <div className="mt-16 grid grid-cols-2 gap-8">
        <p className="border-t border-black pt-1">Sent by</p>
        <p className="border-t border-black pt-1">Received by (job worker)</p>
      </div>
    </div>
  );
}
