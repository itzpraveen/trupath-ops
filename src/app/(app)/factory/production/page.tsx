import { QcDialog } from "../qc-dialog";
import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { Download } from "lucide-react";
import { cn } from "cn";
import { voidProduction } from "@/actions/factory";
import { db } from "@/db";
import { productionEntries, productionPlans, products, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDate, monthKey, monthRange } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { canEdit } from "@/lib/permissions";
import { getBrands } from "@/lib/queries/common";
import { pick, qs } from "@/lib/url";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/app/confirm-action";
import { MonthNav } from "@/components/app/month-nav";
import { PageHeader, Section } from "@/components/app/page-header";
import { Stat, StatGrid } from "@/components/app/stat";
import { Table, TableBody, TableCard, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/app/data-table";

export const metadata: Metadata = { title: "Production" };

export default async function ProductionPage(props: PageProps<"/factory/production">) {
  const user = await requireUser("factory");
  const sp = await props.searchParams;
  const month = /^\d{4}-\d{2}$/.test(String(sp.month ?? "")) ? String(sp.month) : monthKey();
  const brands = await getBrands();
  const BRAND: Record<string, string> = Object.fromEntries(brands.map((b) => [b.id, b.name]));
  const brand = pick(sp.brand, ["all", ...brands.map((b) => b.id)], "all");
  const [from, to] = monthRange(month);
  const qcOnly = sp.qc === "pending";
  const where = and(qcOnly ? and(isNull(productionEntries.voidedAt), sql`${productionEntries.qty} > ${productionEntries.acceptedQty} + ${productionEntries.rejectedQty}`) : and(gte(productionEntries.workDate, from), lte(productionEntries.workDate, to)), brand === "all" ? undefined : eq(productionEntries.brandId, brand));
  const [rows, byProduct, byWorker] = await Promise.all([
    db
      .select({ e: productionEntries, name: products.name, variant: products.variant, userName: users.name, planNumber: productionPlans.number })
      .from(productionEntries)
      .innerJoin(products, eq(products.id, productionEntries.productId))
      .leftJoin(users, eq(users.id, productionEntries.userId))
      .leftJoin(productionPlans, eq(productionPlans.id, productionEntries.planId))
      .where(where)
      .orderBy(desc(productionEntries.workDate), desc(productionEntries.createdAt)),
    db
      .select({
        name: products.name,
        variant: products.variant,
        brandId: productionEntries.brandId,
        units: sql<number>`sum(${productionEntries.qty})::int`,
        accepted: sql<number>`coalesce(sum(${productionEntries.acceptedQty}),0)::int`,
        rejected: sql<number>`coalesce(sum(${productionEntries.rejectedQty}),0)::int`,
        cost: sql<number>`coalesce(sum(${productionEntries.materialCostP}),0)::float8`,
        labour: sql<number>`coalesce(sum(${productionEntries.labourCostP}),0)::float8`,
      })
      .from(productionEntries)
      .innerJoin(products, eq(products.id, productionEntries.productId))
      .where(and(where, isNull(productionEntries.voidedAt)))
      .groupBy(products.name, products.variant, productionEntries.brandId)
      .orderBy(desc(sql`sum(${productionEntries.qty})`), asc(products.name)),
    db
      .select({
        worker: productionEntries.workerName,
        units: sql<number>`sum(${productionEntries.qty})::int`,
        accepted: sql<number>`coalesce(sum(${productionEntries.acceptedQty}),0)::int`,
        rejected: sql<number>`coalesce(sum(${productionEntries.rejectedQty}),0)::int`,
        days: sql<number>`count(distinct ${productionEntries.workDate})::int`,
      })
      .from(productionEntries)
      .where(and(where, isNull(productionEntries.voidedAt)))
      .groupBy(productionEntries.workerName)
      .orderBy(desc(sql`sum(${productionEntries.qty})`)),
  ]);
  const live = rows.filter((r) => !r.e.voidedAt);
  const units = live.reduce((s, r) => s + r.e.qty, 0);
  const materialCost = live.reduce((s, r) => s + r.e.materialCostP, 0);
  const labourCost = live.reduce((s, r) => s + r.e.labourCostP, 0);
  const accepted = live.reduce((s, r) => s + r.e.acceptedQty, 0);
  const rejected = live.reduce((s, r) => s + r.e.rejectedQty, 0);
  const days = new Set(live.map((r) => r.e.workDate)).size;
  const editable = canEdit(user.role, "factory");

  return (
    <>
      <PageHeader title={qcOnly ? "Awaiting QC" : "Production"} description={qcOnly ? "Uninspected quantities across all dates." : "Work completed and QC results, by month."} backHref="/factory" backLabel="Daily register">
        <Link href={`/api/export/production?month=${month}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Download /> Export CSV
        </Link>
      </PageHeader>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
          {[["all", "All brands"], ...brands.map((b) => [b.id, b.name] as [string, string])].map(([v, l]) => (
            <Link key={v} href={`/factory/production${qs({ month, brand: v })}`} className={cn("rounded-md px-3 py-1", brand === v ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {l}
            </Link>
          ))}
        </div>
        <MonthNav month={month} basePath="/factory/production" params={{ brand }} />
      </div>
      <StatGrid className="mb-6">
        <Stat label="Units made" value={units} hint={days ? `${Math.round(units / days)} a day over ${days} ${days === 1 ? "day" : "days"}` : undefined} tone="primary" />
        <Stat label="QC accepted" value={accepted} hint={rejected ? `${rejected} rejected` : undefined} tone={rejected ? "warning" : "default"} />
        <Stat label="Production cost" value={formatINR(materialCost + labourCost)} hint={`materials ${formatINR(materialCost)}${labourCost ? ` + labour ${formatINR(labourCost)}` : ""}`} />
        <Stat label="Cost per accepted piece" value={accepted ? formatINR(Math.round((materialCost + labourCost) / accepted)) : "—"} hint="rejects carry their own cost" />
      </StatGrid>
      <div className="space-y-8">
        {byProduct.length ? (
          <Section title="What each product cost" description="Material and labour recorded against the batches, and what one accepted piece worked out at.">
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="hidden sm:table-cell">Brand</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Accepted</TableHead>
                    <TableHead className="text-right">Material</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Labour</TableHead>
                    <TableHead className="text-right">Cost / accepted piece</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byProduct.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.name}{r.variant ? ` — ${r.variant}` : ""}</TableCell>
                      <TableCell className="hidden sm:table-cell">{BRAND[r.brandId] ?? r.brandId}</TableCell>
                      <TableCell className="tabular text-right font-medium">{r.units}</TableCell>
                      <TableCell className="tabular text-right">
                        {r.accepted}
                        {r.rejected ? <span className="block text-xs text-warning">{r.rejected} rejected</span> : null}
                      </TableCell>
                      <TableCell className="tabular text-right">{formatINR(Number(r.cost))}</TableCell>
                      <TableCell className="tabular hidden text-right md:table-cell">{Number(r.labour) ? formatINR(Number(r.labour)) : "—"}</TableCell>
                      <TableCell className="tabular text-right font-medium">{r.accepted ? formatINR(Math.round((Number(r.cost) + Number(r.labour)) / r.accepted)) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          </Section>
        ) : null}
        {byWorker.length ? (
          <Section title="Who made what" description="Output and QC result by the person recorded on each batch.">
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Made by</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Accepted</TableHead>
                    <TableHead className="text-right">Rejected</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Days worked</TableHead>
                    <TableHead className="text-right">Reject rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byWorker.map((r, i) => {
                    const inspected = r.accepted + r.rejected;
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.worker ?? "Not recorded"}</TableCell>
                        <TableCell className="tabular text-right">{r.units}</TableCell>
                        <TableCell className="tabular text-right">{r.accepted}</TableCell>
                        <TableCell className={cn("tabular text-right", r.rejected && "text-warning")}>{r.rejected}</TableCell>
                        <TableCell className="tabular hidden text-right sm:table-cell">{r.days}</TableCell>
                        <TableCell className="tabular text-right">{inspected ? `${Math.round((r.rejected / inspected) * 100)}%` : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableCard>
          </Section>
        ) : null}
        <Section title="All entries">
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>No.</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead><TableHead>QC</TableHead>
                  <TableHead className="hidden sm:table-cell">Made by</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Material cost</TableHead>
                  {editable ? <TableHead className="w-16" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableEmpty colSpan={7}>No production recorded this month.</TableEmpty>
                ) : (
                  rows.map(({ e, name, variant, userName, planNumber }) => (
                    <TableRow key={e.id} className={cn(e.voidedAt && "opacity-50")}>
                      <TableCell className="whitespace-nowrap">
                        <Link href={`/factory?date=${e.workDate}`} className="hover:underline">{formatDate(e.workDate, "d MMM")}</Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.number}</TableCell>
                      <TableCell>
                        <span className={cn(e.voidedAt && "line-through")}>{name}{variant ? ` — ${variant}` : ""}</span>
                        <span className="block text-xs text-muted-foreground">{BRAND[e.brandId] ?? e.brandId}{planNumber ? ` · ${planNumber}` : ""}{e.voidedAt ? ` · voided: ${e.voidReason}` : ""}</span>
                      </TableCell>
                      <TableCell className="tabular text-right font-medium">{e.qty}</TableCell>
                      <TableCell><span className="block text-xs">{e.acceptedQty} accepted · {e.rejectedQty} rejected</span><span className="block text-xs text-muted-foreground">{e.qcRequired ? `${e.qty - e.acceptedQty - e.rejectedQty} awaiting QC` : "Recorded before QC workflow"}</span>{!e.voidedAt && e.qcRequired && editable ? <QcDialog entry={e} /> : null}</TableCell>
                      <TableCell className="hidden sm:table-cell">{e.workerName ?? userName ?? "—"}</TableCell>
                      <TableCell className="tabular hidden text-right md:table-cell">{formatINR(e.materialCostP)}</TableCell>
                      {editable ? (
                        <TableCell className="text-right">
                          {!e.voidedAt ? (
                            <ConfirmAction trigger={<Button variant="ghost" size="xs" className="text-muted-foreground" />} title={`Void ${e.number}?`} description="QC-accepted stock will be removed and consumed materials restored. This requires enough finished stock." action={voidProduction} hidden={{ id: e.id }} confirmLabel="Void entry" destructive withReason>
                              Void
                            </ConfirmAction>
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableCard>
        </Section>
      </div>
    </>
  );
}
