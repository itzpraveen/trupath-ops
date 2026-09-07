import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { cn } from "cn";
import { db } from "@/db";
import { contacts, jobWorkOrders, products } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { canEdit } from "@/lib/permissions";
import { pick, qs, str } from "@/lib/url";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/app/page-header";
import { Stat, StatGrid } from "@/components/app/stat";
import { JOBWORK_TONE, StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCard, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/app/data-table";

export const metadata: Metadata = { title: "Job work" };

export default async function JobWorkPage(props: PageProps<"/jobwork">) {
  const user = await requireUser("jobwork");
  const sp = await props.searchParams;
  const status = pick(sp.status, ["open", "all", "draft", "sent", "partial", "received", "closed", "cancelled"], "open");
  const q = str(sp.q, 80);
  const where = and(
    status === "all" ? undefined : status === "open" ? sql`${jobWorkOrders.status} in ('draft','sent','partial','received')` : eq(jobWorkOrders.status, status),
    q ? or(ilike(jobWorkOrders.number, `%${q}%`), ilike(contacts.name, `%${q}%`), ilike(jobWorkOrders.description, `%${q}%`), ilike(products.name, `%${q}%`)) : undefined,
  );
  const [rows, [stats]] = await Promise.all([
    db
      .select({ o: jobWorkOrders, vendor: contacts.name, productName: products.name, productVariant: products.variant })
      .from(jobWorkOrders)
      .innerJoin(contacts, eq(contacts.id, jobWorkOrders.vendorId))
      .leftJoin(products, eq(products.id, jobWorkOrders.productId))
      .where(where)
      .orderBy(desc(jobWorkOrders.workDate), desc(jobWorkOrders.createdAt))
      .limit(200),
    db
      .select({
        open: sql<number>`count(*) filter (where ${jobWorkOrders.status} in ('sent','partial'))::int`,
        pendingPcs: sql<number>`coalesce(sum(greatest(${jobWorkOrders.orderedQty} - ${jobWorkOrders.receivedQty} - ${jobWorkOrders.rejectedQty}, 0)) filter (where ${jobWorkOrders.status} in ('sent','partial')),0)::int`,
        unbilled: sql<number>`count(*) filter (where ${jobWorkOrders.receivedQty} > 0 and ${jobWorkOrders.billedAt} is null and ${jobWorkOrders.status} <> 'cancelled')::int`,
        unbilledValue: sql<number>`coalesce(sum(${jobWorkOrders.receivedQty} * ${jobWorkOrders.ratePerUnitP} * (1 + ${jobWorkOrders.taxBps}/10000.0)) filter (where ${jobWorkOrders.billedAt} is null and ${jobWorkOrders.status} <> 'cancelled'),0)::float8`,
      })
      .from(jobWorkOrders)
      .where(isNull(jobWorkOrders.billedAt)),
  ]);
  const editable = canEdit(user.role, "jobwork");
  const params = { status, q: q || undefined };

  return (
    <>
      <PageHeader title="Job work" description="Work sent to outside stitching units and job workers, the materials that went with it, and what came back.">
        {editable ? (
          <Link href="/jobwork/new" className={buttonVariants({ size: "sm" })}>
            <Plus /> New job work
          </Link>
        ) : null}
      </PageHeader>
      <StatGrid className="mb-5">
        <Stat label="Orders out" value={Number(stats?.open ?? 0)} />
        <Stat label="Pieces pending" value={Number(stats?.pendingPcs ?? 0)} tone={Number(stats?.pendingPcs ?? 0) > 0 ? "warning" : "default"} />
        <Stat label="Bills to record" value={Number(stats?.unbilled ?? 0)} hint="received but not billed" />
        <Stat label="Estimated bills" value={formatINR(Math.round(Number(stats?.unbilledValue ?? 0)))} hint="received pieces × rate" />
      </StatGrid>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
          {[
            ["open", "Open"],
            ["sent", "With job worker"],
            ["received", "Received"],
            ["closed", "Closed"],
            ["all", "All"],
          ].map(([v, l]) => (
            <Link key={v} href={`/jobwork${qs({ ...params, status: v })}`} className={cn("rounded-md px-3 py-1", status === v ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {l}
            </Link>
          ))}
        </div>
        <form className="flex items-center gap-2" action="/jobwork">
          <input type="hidden" name="status" value={status} />
          <Input name="q" defaultValue={q} placeholder="Number, job worker, product…" className="w-56" />
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
              <TableHead>Job worker</TableHead>
              <TableHead className="hidden md:table-cell">Work</TableHead>
              <TableHead className="text-right">Ordered</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Rate</TableHead>
              <TableHead className="hidden lg:table-cell">Due</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={8}>{status === "open" ? "No job work in progress." : "No orders match."}</TableEmpty>
            ) : (
              rows.map(({ o, vendor, productName, productVariant }) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link href={`/jobwork/${o.id}`} className="font-medium hover:underline">
                      {o.number}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{formatDate(o.workDate, "d MMM")}</span>
                  </TableCell>
                  <TableCell>{vendor}</TableCell>
                  <TableCell className="hidden max-w-64 md:table-cell">
                    <span className="block truncate">{o.process}{productName ? ` · ${productName}${productVariant ? ` — ${productVariant}` : ""}` : ""}</span>
                    {o.description ? <span className="block truncate text-xs text-muted-foreground">{o.description}</span> : null}
                  </TableCell>
                  <TableCell className="tabular text-right">{o.orderedQty}</TableCell>
                  <TableCell className="tabular text-right font-medium">
                    {o.receivedQty}
                    {o.rejectedQty ? <span className="block text-xs text-destructive">{o.rejectedQty} rejected</span> : null}
                  </TableCell>
                  <TableCell className="tabular hidden text-right sm:table-cell">{o.ratePerUnitP ? formatINR(o.ratePerUnitP) : "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell">{formatDate(o.dueDate, "d MMM")}</TableCell>
                  <TableCell>
                    <StatusBadge tone={JOBWORK_TONE[o.status]}>{o.status === "sent" ? "with job worker" : o.status}</StatusBadge>
                    {o.billedAt ? <span className="block text-xs text-muted-foreground">billed</span> : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableCard>
    </>
  );
}
