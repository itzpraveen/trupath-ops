import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { ExternalLink, Truck } from "lucide-react";
import { createDispatchFromOrder } from "@/actions/dispatch";
import { db } from "@/db";
import { businessRecords, dispatches, products, shopifyOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { canEdit } from "@/lib/permissions";
import { getShopifyAuth } from "@/lib/shopify";
import { Button, buttonVariants } from "@/components/ui/button";
import { Amount } from "@/components/app/amount";
import { PageHeader, Section } from "@/components/app/page-header";
import { DISPATCH_TONE, StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/app/data-table";
import { SyncButton } from "../sync-button";

export const metadata: Metadata = { title: "Order" };
const pretty = (s: string) => s.toLowerCase().replace(/_/g, " ");

export default async function OrderPage(props: PageProps<"/orders/[id]">) {
  const user = await requireUser("orders");
  const { id } = await props.params;
  if (!/^\d+$/.test(id)) notFound();
  const [o] = await db.select().from(shopifyOrders).where(eq(shopifyOrders.id, id)).limit(1);
  if (!o) notFound();
  const variantIds = o.lineItems.map((l) => l.variantId).filter((v): v is string => !!v);
  const [matched, dsp, records] = await Promise.all([
    variantIds.length ? db.select({ id: products.id, shopifyVariantId: products.shopifyVariantId, stockQty: products.stockQty }).from(products).where(inArray(products.shopifyVariantId, variantIds)) : Promise.resolve([]),
    db.select().from(dispatches).where(eq(dispatches.shopifyOrderId, id)).limit(1),
    db.select().from(businessRecords).where(eq(businessRecords.shopifyOrderId, id)),
  ]);
  const byVariant = new Map(matched.map((m) => [m.shopifyVariantId!, m]));
  const editable = canEdit(user.role, "orders") && canEdit(user.role, "dispatch");
  const addr = o.shippingAddress ?? {};
  const handle = (await getShopifyAuth())?.shop.replace(".myshopify.com", "");
  const adminUrl = handle ? `https://admin.shopify.com/store/${handle}/orders/${o.id}` : null;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {o.name}
            {o.cancelledAt ? <StatusBadge tone="destructive">cancelled</StatusBadge> : <StatusBadge tone={o.fulfillmentStatus === "FULFILLED" ? "success" : "info"}>{pretty(o.fulfillmentStatus)}</StatusBadge>}
            <StatusBadge tone={o.financialStatus === "PAID" ? "success" : "warning"}>{pretty(o.financialStatus)}</StatusBadge>
          </span>
        }
        description={`Placed ${formatDateTime(o.createdAtShop)} · ${o.gateway ?? "payment unknown"}${o.tags ? ` · ${o.tags}` : ""}`}
        backHref="/orders"
        backLabel="Website orders"
      >
        {editable ? <SyncButton orderId={o.id} label="Refresh" variant="ghost" /> : null}
        {adminUrl ? (
          <a href={adminUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ExternalLink /> Open in Shopify
          </a>
        ) : null}
        {dsp[0] ? (
          <Link href={`/dispatch/${dsp[0].id}`} className={buttonVariants({ size: "sm" })}>
            <Truck /> Dispatch {dsp[0].number} <StatusBadge tone={DISPATCH_TONE[dsp[0].status]} className="ml-1">{dsp[0].status}</StatusBadge>
          </Link>
        ) : editable && !o.cancelledAt ? (
          <form action={createDispatchFromOrder.bind(null, o.id)}>
            <Button type="submit" size="sm">
              <Truck /> Create dispatch
            </Button>
          </form>
        ) : null}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <Section title="Items">
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="hidden sm:table-cell">SKU</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Price</TableHead>
                    <TableHead className="hidden text-right md:table-cell">In stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {o.lineItems.map((l) => {
                    const m = l.variantId ? byVariant.get(l.variantId) : undefined;
                    return (
                      <TableRow key={l.id}>
                        <TableCell>
                          {m ? (
                            <Link href={`/stock/${m.id}`} className="hover:underline">
                              {l.title}
                            </Link>
                          ) : (
                            l.title
                          )}
                          {l.variantTitle ? <span className="block text-xs text-muted-foreground">{l.variantTitle}</span> : null}
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{l.sku ?? "—"}</TableCell>
                        <TableCell className="tabular text-right font-medium">{l.quantity}</TableCell>
                        <TableCell className="tabular hidden text-right sm:table-cell">{formatINR(l.priceP)}</TableCell>
                        <TableCell className="tabular hidden text-right md:table-cell">{m ? m.stockQty : <span className="text-xs text-muted-foreground">not in catalogue</span>}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableCard>
          </Section>
          <Section title="Totals">
            <div className="rounded-xl border bg-card p-4 text-sm">
              <dl className="grid grid-cols-2 gap-y-1">
                <dt className="text-muted-foreground">Subtotal</dt><dd className="text-right"><Amount paise={o.subtotalP} /></dd>
                <dt className="text-muted-foreground">Discount</dt><dd className="text-right"><Amount paise={-o.discountP} /></dd>
                <dt className="text-muted-foreground">Shipping</dt><dd className="text-right"><Amount paise={o.shippingP} /></dd>
                <dt className="text-muted-foreground">Tax (included)</dt><dd className="text-right"><Amount paise={o.taxP} /></dd>
                <dt className="font-medium">Total</dt><dd className="text-right font-semibold"><Amount paise={o.totalP} /></dd>
                {o.refundedP ? (<><dt className="text-destructive">Refunded</dt><dd className="text-right text-destructive"><Amount paise={-o.refundedP} /></dd></>) : null}
              </dl>
            </div>
          </Section>
        </div>
        <div className="space-y-6">
          <Section title="Customer">
            <div className="rounded-xl border bg-card p-4 text-sm">
              <p className="font-medium">{o.customerName}</p>
              {o.phone ? <p>{o.phone}</p> : null}
              {o.email ? <p className="text-muted-foreground">{o.email}</p> : null}
              <p className="mt-2 whitespace-pre-line text-muted-foreground">{[addr.address1, addr.address2, addr.city, addr.province, addr.zip, addr.country].filter(Boolean).join("\n")}</p>
              {o.note ? <p className="mt-2 rounded-md bg-muted px-2 py-1.5">Note: {o.note}</p> : null}
            </div>
          </Section>
          <Section title="In the books">
            <ul className="divide-y rounded-xl border bg-card text-sm">
              {records.length ? (
                records.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-4 py-2">
                    <span className={r.voidedAt ? "line-through opacity-60" : ""}>
                      <span className="capitalize">{r.kind}</span> {r.number ? `· ${r.number}` : ""} · {r.workDate}
                    </span>
                    <Amount paise={r.amountP} tone={r.kind === "sale" ? "in" : "out"} className="font-medium" />
                  </li>
                ))
              ) : (
                <li className="px-4 py-2 text-muted-foreground">No ledger entries yet.</li>
              )}
              <li className="px-4 py-2 text-xs text-muted-foreground">
                Stock {o.stockDeducted ? "deducted when fulfilled" : "not deducted yet (happens when Shopify marks it fulfilled)"}. Synced {formatDateTime(o.syncedAt)}.
              </li>
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}
