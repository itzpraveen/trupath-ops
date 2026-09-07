import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { Pencil, Printer } from "lucide-react";
import { db } from "@/db";
import { dispatchItems, dispatches, products, shopifyOrders, uploads } from "@/db/schema";
import { FULFIL_SCOPE, getStoreByShop, hasScope } from "@/lib/shopify-oauth";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime, todayIST } from "@/lib/dates";
import { canEdit } from "@/lib/permissions";
import { getBrands, getCategories, getContacts, getEntities, getProductOptions } from "@/lib/queries/common";
import { buttonVariants } from "@/components/ui/button";
import { Amount } from "@/components/app/amount";
import { PageHeader, Section } from "@/components/app/page-header";
import { PhotoUploader } from "@/components/app/photo-uploader";
import { DISPATCH_TONE, StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/app/data-table";
import { DispatchActions } from "../dispatch-actions";
import { DispatchForm } from "../dispatch-form";

export const metadata: Metadata = { title: "Dispatch" };

export default async function DispatchDetailPage(props: PageProps<"/dispatch/[id]">) {
  const user = await requireUser("dispatch");
  const { id } = await props.params;
  const sp = await props.searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [d] = await db.select().from(dispatches).where(eq(dispatches.id, id)).limit(1);
  if (!d) notFound();
  const [items, photos, brands] = await Promise.all([
    db.select({ it: dispatchItems, name: products.name, variant: products.variant, sku: products.sku, stockQty: products.stockQty }).from(dispatchItems).innerJoin(products, eq(products.id, dispatchItems.productId)).where(eq(dispatchItems.dispatchId, id)),
    db.select({ id: uploads.id, fileName: uploads.fileName, size: uploads.size, createdAt: uploads.createdAt }).from(uploads).where(and(eq(uploads.kind, "dispatch_photo"), eq(uploads.refId, id))).orderBy(desc(uploads.createdAt)),
    getBrands(),
  ]);
  const editable = canEdit(user.role, "dispatch");
  const editing = editable && sp.edit === "1";
  let canFulfil: boolean | undefined;
  if (d.shopifyOrderId) {
    const [o] = await db.select({ shop: shopifyOrders.shop }).from(shopifyOrders).where(eq(shopifyOrders.id, d.shopifyOrderId)).limit(1);
    const store = o?.shop ? await getStoreByShop(o.shop) : null;
    canFulfil = !!store && hasScope(store.scope, FULFIL_SCOPE);
  }
  const brandName = brands.find((b) => b.id === d.brandId)?.name ?? d.brandId;
  const pcs = items.reduce((s, r) => s + r.it.qty, 0);

  if (editing) {
    const [productOptions, channels, customers, entities] = await Promise.all([getProductOptions(), getCategories("channel"), getContacts("customer"), getEntities()]);
    return (
      <>
        <PageHeader title={`Edit ${d.number}`} backHref={`/dispatch/${id}`} backLabel="Back to dispatch" />
        <DispatchForm products={productOptions} brands={brands} entities={entities.map((e) => ({ id: e.id, name: e.name }))} channels={channels.map((c) => c.name)} customers={customers.map((c) => ({ id: c.id, name: c.name }))} date={todayIST()} initial={{ ...d, items: items.map((r) => ({ productId: r.it.productId, qty: r.it.qty })) }} itemsLocked={d.stockDeducted} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {d.number} <StatusBadge tone={DISPATCH_TONE[d.status]}>{d.status}</StatusBadge>
          </span>
        }
        description={`${brandName} · ${formatDate(d.dispatchDate)}${d.orderRef ? ` · ${d.orderRef}` : ""}${d.shopifyOrderId ? " · from website order" : ""}`}
        backHref="/dispatch"
        backLabel="Dispatch"
      >
        <Link href={`/print/dispatch/${d.id}`} target="_blank" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Printer /> Print challan
        </Link>
        {editable && d.status !== "cancelled" ? (
          <Link href={`/dispatch/${d.id}?edit=1`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Pencil /> Edit
          </Link>
        ) : null}
      </PageHeader>

      {editable ? (
        <div className="mb-6">
          <DispatchActions dispatch={d} canFulfil={canFulfil} />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <Section title={`Items · ${pcs} pcs`}>
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="hidden sm:table-cell">SKU</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">In stock now</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r) => (
                    <TableRow key={r.it.id}>
                      <TableCell>
                        <Link href={`/stock/${r.it.productId}`} className="hover:underline">
                          {r.name}
                          {r.variant ? ` — ${r.variant}` : ""}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{r.sku ?? "—"}</TableCell>
                      <TableCell className="tabular text-right font-medium">{r.it.qty}</TableCell>
                      <TableCell className={`tabular hidden text-right sm:table-cell ${!d.stockDeducted && r.stockQty < r.it.qty ? "text-warning" : "text-muted-foreground"}`}>{r.stockQty}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
            {!d.stockDeducted && items.some((r) => r.stockQty < r.it.qty) ? <p className="mt-2 text-xs text-warning">Some items have less stock than this dispatch needs. Record production or a stock count first, or the balance will go negative when shipped.</p> : null}
          </Section>
          <Section title="Photos">
            <PhotoUploader kind="dispatch_photo" refId={d.id} photos={photos.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() }))} editable={editable} />
          </Section>
        </div>
        <div className="space-y-6">
          <Section title="Deliver to">
            <div className="rounded-xl border bg-card p-4 text-sm">
              <p className="font-medium">{d.customerName}</p>
              {d.phone ? <p>{d.phone}</p> : null}
              {d.address ? <p className="mt-1 whitespace-pre-line text-muted-foreground">{d.address}</p> : null}
              {d.amountP ? (
                <p className="mt-3">
                  Order value <Amount paise={d.amountP} className="font-medium" />
                </p>
              ) : null}
            </div>
          </Section>
          <Section title="Courier">
            <div className="rounded-xl border bg-card p-4 text-sm">
              {d.courier || d.trackingNo ? (
                <>
                  <p className="font-medium">{d.courier ?? "Courier"}</p>
                  {d.trackingNo ? <p className="tabular">{d.trackingNo}</p> : null}
                  {d.trackingUrl ? (
                    <a href={d.trackingUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      Track parcel
                    </a>
                  ) : null}
                </>
              ) : (
                <p className="text-muted-foreground">Added when the parcel is marked shipped.</p>
              )}
            </div>
          </Section>
          <Section title="Timeline">
            <ul className="space-y-1.5 rounded-xl border bg-card p-4 text-sm">
              <li className="flex justify-between"><span>Created</span><span className="text-muted-foreground">{formatDateTime(d.createdAt)}</span></li>
              {d.shippedAt ? <li className="flex justify-between"><span>Shipped</span><span className="text-muted-foreground">{formatDateTime(d.shippedAt)}</span></li> : null}
              {d.deliveredAt ? <li className="flex justify-between"><span>Delivered</span><span className="text-muted-foreground">{formatDateTime(d.deliveredAt)}</span></li> : null}
              <li className="flex justify-between"><span>Stock</span><span className="text-muted-foreground">{d.stockDeducted ? "deducted" : "not yet deducted"}</span></li>
            </ul>
            {d.note ? <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{d.note}</p> : null}
          </Section>
        </div>
      </div>
    </>
  );
}
