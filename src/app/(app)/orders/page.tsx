import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, ilike, isNull, isNotNull, or, sql } from "drizzle-orm";
import { Download } from "lucide-react";
import { cn } from "cn";
import { db } from "@/db";
import { shopifyOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDateTime, monthRange, monthKey } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { canEdit } from "@/lib/permissions";
import { ordersSummary } from "@/lib/queries/dashboard";
import { getLastSync, isShopifyConfigured } from "@/lib/shopify";
import { int, pick, qs, str } from "@/lib/url";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Amount } from "@/components/app/amount";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Stat, StatGrid } from "@/components/app/stat";
import { StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCard, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/app/data-table";
import { SyncButton } from "./sync-button";

export const metadata: Metadata = { title: "Website orders" };
const PAGE = 50;

export function financialTone(s: string) {
  if (s === "PAID") return "success" as const;
  if (s === "REFUNDED" || s === "VOIDED") return "destructive" as const;
  if (s === "PARTIALLY_REFUNDED") return "warning" as const;
  return "warning" as const;
}
export function fulfillmentTone(s: string) {
  if (s === "FULFILLED") return "success" as const;
  if (s === "RESTOCKED") return "neutral" as const;
  return "info" as const;
}
const pretty = (s: string) => s.toLowerCase().replace(/_/g, " ");

export default async function OrdersPage(props: PageProps<"/orders">) {
  const user = await requireUser("orders");
  const sp = await props.searchParams;
  const configured = await isShopifyConfigured();
  const status = pick(sp.status, ["all", "toship", "shipped", "cancelled"], "toship");
  const q = str(sp.q, 80);
  const page = int(sp.page);
  const editable = canEdit(user.role, "orders");

  if (!configured) {
    return (
      <>
        <PageHeader title="Website orders" description="Orders from babygambling.in, synced from Shopify." />
        <EmptyState title="Shopify is not connected yet" description="Once connected, orders, refunds and product changes flow in automatically, and website sales appear in the books without typing.">
          {user.role === "owner" ? (
            <Link href="/settings/shopify" className={buttonVariants({ size: "sm" })}>
              Connect Shopify
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground">Ask the owner to connect it in Settings.</p>
          )}
        </EmptyState>
      </>
    );
  }

  const where = and(
    status === "toship" ? and(isNull(shopifyOrders.cancelledAt), sql`${shopifyOrders.fulfillmentStatus} not in ('FULFILLED','RESTOCKED')`) : status === "shipped" ? sql`${shopifyOrders.fulfillmentStatus} = 'FULFILLED'` : status === "cancelled" ? isNotNull(shopifyOrders.cancelledAt) : undefined,
    q ? or(ilike(shopifyOrders.name, `%${q}%`), ilike(shopifyOrders.customerName, `%${q}%`), ilike(shopifyOrders.phone, `%${q}%`), ilike(shopifyOrders.email, `%${q}%`), ilike(shopifyOrders.city, `%${q}%`)) : undefined,
  );
  const month = monthKey();
  const [mFrom, mTo] = monthRange(month);
  const [rows, [{ total }], summary, sync] = await Promise.all([
    db.select().from(shopifyOrders).where(where).orderBy(desc(shopifyOrders.createdAtShop)).limit(PAGE).offset((page - 1) * PAGE),
    db.select({ total: count() }).from(shopifyOrders).where(where),
    ordersSummary(new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) + "T00:00:00+05:30"), mFrom, mTo),
    getLastSync(),
  ]);
  const params = { status, q: q || undefined };
  const pages = Math.max(1, Math.ceil(Number(total) / PAGE));

  return (
    <>
      <PageHeader title="Website orders" description={sync.lastOk ? `Last synced ${formatDateTime(sync.lastOk.startedAt)}${sync.last?.status === "error" ? ` · last attempt failed: ${sync.last.message}` : ""}` : "Not synced yet. Run the first sync to pull recent orders."}>
        {editable ? <SyncButton /> : null}
        <Link href="/api/export/orders" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Download /> Export CSV
        </Link>
      </PageHeader>
      <StatGrid className="mb-5">
        <Stat label="Waiting to ship" value={summary.open} tone={summary.open ? "warning" : "default"} />
        <Stat label="Today" value={summary.today} />
        <Stat label="This month" value={summary.monthCount} hint="orders" />
        <Stat label="Revenue this month" value={formatINR(summary.monthTotal)} />
      </StatGrid>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
          {[
            ["toship", "To ship"],
            ["shipped", "Shipped"],
            ["cancelled", "Cancelled"],
            ["all", "All"],
          ].map(([v, l]) => (
            <Link key={v} href={`/orders${qs({ ...params, status: v, page: undefined })}`} className={cn("rounded-md px-3 py-1", status === v ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {l}
            </Link>
          ))}
        </div>
        <form className="flex items-center gap-2" action="/orders">
          <input type="hidden" name="status" value={status} />
          <Input name="q" defaultValue={q} placeholder="Order no., name, phone, city…" className="w-56" />
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
        </form>
      </div>
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Placed</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="hidden md:table-cell">Items</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Fulfilment</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={7}>{status === "toship" ? "Nothing waiting to ship." : "No orders match."}{sync.lastOk ? "" : " Run a sync to pull orders from Shopify."}</TableEmpty>
            ) : (
              rows.map((o) => (
                <TableRow key={o.id} className={cn(o.cancelledAt && "opacity-60")}>
                  <TableCell>
                    <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
                      {o.name}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(o.createdAtShop)}</TableCell>
                  <TableCell>
                    <span className="block max-w-48 truncate">{o.customerName}</span>
                    <span className="block max-w-48 truncate text-xs text-muted-foreground">{[o.city, o.province].filter(Boolean).join(", ")}</span>
                  </TableCell>
                  <TableCell className="hidden max-w-64 truncate text-xs text-muted-foreground md:table-cell">{o.lineItems.map((l) => `${l.quantity} × ${l.title}`).join(", ")}</TableCell>
                  <TableCell>
                    <StatusBadge tone={financialTone(o.financialStatus)}>{pretty(o.financialStatus)}</StatusBadge>
                    {o.gateway && /cash|cod|delivery/i.test(o.gateway) ? <span className="ml-1 text-xs text-muted-foreground">COD</span> : null}
                  </TableCell>
                  <TableCell>{o.cancelledAt ? <StatusBadge tone="destructive">cancelled</StatusBadge> : <StatusBadge tone={fulfillmentTone(o.fulfillmentStatus)}>{pretty(o.fulfillmentStatus)}</StatusBadge>}</TableCell>
                  <TableCell className="text-right">
                    <Amount paise={o.totalP} className="font-medium" />
                    {o.refundedP ? <span className="block text-xs text-destructive">−{formatINR(o.refundedP)}</span> : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableCard>
      {pages > 1 ? (
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {Number(total)} orders · page {page} of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? <Link href={`/orders${qs({ ...params, page: page - 1 })}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Previous</Link> : null}
            {page < pages ? <Link href={`/orders${qs({ ...params, page: page + 1 })}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Next</Link> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
