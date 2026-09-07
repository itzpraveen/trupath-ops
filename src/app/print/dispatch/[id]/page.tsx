import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { dispatchItems, dispatches, entities, products } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { PrintButton } from "../../print-button";

export default async function DispatchChallanPage(props: PageProps<"/print/dispatch/[id]">) {
  await requireUser("dispatch");
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [d] = await db.select().from(dispatches).where(eq(dispatches.id, id)).limit(1);
  if (!d) notFound();
  const [items, [entity]] = await Promise.all([
    db.select({ qty: dispatchItems.qty, name: products.name, variant: products.variant, sku: products.sku }).from(dispatchItems).innerJoin(products, eq(products.id, dispatchItems.productId)).where(eq(dispatchItems.dispatchId, id)),
    db.select().from(entities).where(eq(entities.id, d.entityId)).limit(1),
  ]);
  const pcs = items.reduce((s, r) => s + r.qty, 0);
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
          <p className="text-lg font-bold">Delivery challan</p>
          <p>{d.number}</p>
          <p>{formatDate(d.dispatchDate)}</p>
          {d.orderRef ? <p>Ref {d.orderRef}</p> : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6 py-4">
        <div>
          <p className="font-semibold">Deliver to</p>
          <p>{d.customerName}</p>
          {d.phone ? <p>{d.phone}</p> : null}
          {d.address ? <p className="whitespace-pre-line">{d.address}</p> : null}
        </div>
        <div>
          <p className="font-semibold">Courier</p>
          <p>{d.courier ?? "—"}</p>
          {d.trackingNo ? <p>{d.trackingNo}</p> : null}
        </div>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-black text-left">
            <th className="py-1.5 pr-2">#</th>
            <th className="py-1.5 pr-2">Item</th>
            <th className="py-1.5 pr-2">SKU</th>
            <th className="py-1.5 text-right">Qty</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r, i) => (
            <tr key={i} className="border-b border-gray-300">
              <td className="py-1.5 pr-2">{i + 1}</td>
              <td className="py-1.5 pr-2">
                {r.name}
                {r.variant ? ` — ${r.variant}` : ""}
              </td>
              <td className="py-1.5 pr-2">{r.sku ?? ""}</td>
              <td className="py-1.5 text-right">{r.qty}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-1.5" colSpan={3}>
              Total pieces
            </td>
            <td className="py-1.5 text-right">{pcs}</td>
          </tr>
        </tbody>
      </table>
      {d.amountP ? <p className="mt-3">Declared value: {formatINR(d.amountP)}</p> : null}
      {d.note ? <p className="mt-2 whitespace-pre-line text-gray-700">{d.note}</p> : null}
      <div className="mt-16 grid grid-cols-2 gap-8">
        <p className="border-t border-black pt-1">Packed by</p>
        <p className="border-t border-black pt-1">Received by</p>
      </div>
    </div>
  );
}
