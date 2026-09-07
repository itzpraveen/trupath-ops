import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { cn } from "cn";
import { db } from "@/db";
import { dispatchItems, dispatches } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { canEdit } from "@/lib/permissions";
import { getBrands } from "@/lib/queries/common";
import { dispatchCounts } from "@/lib/queries/dashboard";
import { int, pick, qs, str } from "@/lib/url";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Amount } from "@/components/app/amount";
import { PageHeader } from "@/components/app/page-header";
import { Stat, StatGrid } from "@/components/app/stat";
import { DISPATCH_TONE, StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCard, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/app/data-table";

export const metadata: Metadata = { title: "Dispatch" };
const PAGE = 50;

export default async function DispatchPage(props: PageProps<"/dispatch">) {
  const user = await requireUser("dispatch");
  const sp = await props.searchParams;
  const status = pick(sp.status, ["all", "open", "pending", "packed", "shipped", "delivered", "returned", "cancelled"], "open");
  const q = str(sp.q, 80);
  const page = int(sp.page);
  const where = and(
    status === "all" ? undefined : status === "open" ? sql`${dispatches.status} in ('pending','packed','shipped')` : eq(dispatches.status, status),
    q ? or(ilike(dispatches.customerName, `%${q}%`), ilike(dispatches.number, `%${q}%`), ilike(dispatches.orderRef, `%${q}%`), ilike(dispatches.phone, `%${q}%`), ilike(dispatches.trackingNo, `%${q}%`)) : undefined,
  );
  const [rows, [{ total }], counts, brands] = await Promise.all([
    db
      .select({ d: dispatches, pcs: sql<number>`coalesce(sum(${dispatchItems.qty}),0)::int` })
      .from(dispatches)
      .leftJoin(dispatchItems, eq(dispatchItems.dispatchId, dispatches.id))
      .where(where)
      .groupBy(dispatches.id)
      .orderBy(desc(dispatches.dispatchDate), desc(dispatches.createdAt))
      .limit(PAGE)
      .offset((page - 1) * PAGE),
    db.select({ total: count() }).from(dispatches).where(where),
    dispatchCounts(),
    getBrands(),
  ]);
  const brandName = Object.fromEntries(brands.map((b) => [b.id, b.name]));
  const editable = canEdit(user.role, "dispatch");
  const params = { status, q: q || undefined };
  const pages = Math.max(1, Math.ceil(Number(total) / PAGE));

  return (
    <>
      <PageHeader title="Dispatch" description="Parcels going out to customers, wholesalers and Firstbon. Stock is deducted when a parcel ships.">
        {editable ? (
          <Link href="/dispatch/new" className={buttonVariants({ size: "sm" })}>
            <Plus /> New dispatch
          </Link>
        ) : null}
      </PageHeader>
      <StatGrid className="mb-5">
        <Stat label="To pack" value={counts.pending ?? 0} tone={(counts.pending ?? 0) > 0 ? "warning" : "default"} />
        <Stat label="Packed, waiting for courier" value={counts.packed ?? 0} />
        <Stat label="On the way" value={counts.shipped ?? 0} />
        <Stat label="Delivered" value={counts.delivered ?? 0} />
      </StatGrid>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
          {[
            ["open", "Open"],
            ["pending", "To pack"],
            ["shipped", "Shipped"],
            ["delivered", "Delivered"],
            ["returned", "Returned"],
            ["cancelled", "Cancelled"],
            ["all", "All"],
          ].map(([v, l]) => (
            <Link key={v} href={`/dispatch${qs({ ...params, status: v, page: undefined })}`} className={cn("rounded-md px-3 py-1", status === v ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {l}
            </Link>
          ))}
        </div>
        <form className="flex items-center gap-2" action="/dispatch">
          <input type="hidden" name="status" value={status} />
          <Input name="q" defaultValue={q} placeholder="Customer, number, tracking…" className="w-56" />
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
        </form>
      </div>
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No.</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="hidden md:table-cell">Brand</TableHead>
              <TableHead className="text-right">Pcs</TableHead>
              <TableHead className="hidden lg:table-cell">Courier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={8}>{status === "open" ? "Nothing waiting to go out." : "No dispatches match."}</TableEmpty>
            ) : (
              rows.map(({ d, pcs }) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <Link href={`/dispatch/${d.id}`} className="font-medium hover:underline">
                      {d.number}
                    </Link>
                    {d.orderRef ? <span className="block text-xs text-muted-foreground">{d.orderRef}</span> : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(d.dispatchDate, "d MMM")}</TableCell>
                  <TableCell>
                    <span className="block max-w-56 truncate">{d.customerName}</span>
                    <span className="block max-w-56 truncate text-xs text-muted-foreground">{d.phone ?? ""}{d.address ? ` · ${d.address.split(",").slice(-3, -1).join(",").trim()}` : ""}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{brandName[d.brandId] ?? d.brandId}</TableCell>
                  <TableCell className="tabular text-right">{pcs}</TableCell>
                  <TableCell className="hidden text-xs lg:table-cell">
                    {d.courier ?? "—"}
                    {d.trackingNo ? <span className="block text-muted-foreground">{d.trackingNo}</span> : null}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={DISPATCH_TONE[d.status]}>{d.status}</StatusBadge>
                  </TableCell>
                  <TableCell className="hidden text-right sm:table-cell">{d.amountP ? <Amount paise={d.amountP} /> : "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableCard>
      {pages > 1 ? (
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {Number(total)} dispatches · page {page} of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? <Link href={`/dispatch${qs({ ...params, page: page - 1 })}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Previous</Link> : null}
            {page < pages ? <Link href={`/dispatch${qs({ ...params, page: page + 1 })}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Next</Link> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
