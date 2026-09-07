import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { Download } from "lucide-react";
import { cn } from "cn";
import { voidProduction } from "@/actions/factory";
import { db } from "@/db";
import { productionEntries, products, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDate, monthKey, monthRange } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { canEdit } from "@/lib/permissions";
import { pick, qs } from "@/lib/url";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/app/confirm-action";
import { MonthNav } from "@/components/app/month-nav";
import { PageHeader, Section } from "@/components/app/page-header";
import { Stat, StatGrid } from "@/components/app/stat";
import { Table, TableBody, TableCard, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/app/data-table";

export const metadata: Metadata = { title: "Production" };
const BRAND: Record<string, string> = { babygambling: "Baby Gambling", firstbon: "Firstbon" };

export default async function ProductionPage(props: PageProps<"/factory/production">) {
  const user = await requireUser("factory");
  const sp = await props.searchParams;
  const month = /^\d{4}-\d{2}$/.test(String(sp.month ?? "")) ? String(sp.month) : monthKey();
  const brand = pick(sp.brand, ["all", "babygambling", "firstbon"], "all");
  const [from, to] = monthRange(month);
  const where = and(gte(productionEntries.workDate, from), lte(productionEntries.workDate, to), brand === "all" ? undefined : eq(productionEntries.brandId, brand));
  const [rows, byProduct] = await Promise.all([
    db
      .select({ e: productionEntries, name: products.name, variant: products.variant, userName: users.name })
      .from(productionEntries)
      .innerJoin(products, eq(products.id, productionEntries.productId))
      .leftJoin(users, eq(users.id, productionEntries.userId))
      .where(where)
      .orderBy(desc(productionEntries.workDate), desc(productionEntries.createdAt)),
    db
      .select({ name: products.name, variant: products.variant, brandId: productionEntries.brandId, units: sql<number>`sum(${productionEntries.qty})::int`, cost: sql<number>`coalesce(sum(${productionEntries.materialCostP}),0)::float8` })
      .from(productionEntries)
      .innerJoin(products, eq(products.id, productionEntries.productId))
      .where(and(where, isNull(productionEntries.voidedAt)))
      .groupBy(products.name, products.variant, productionEntries.brandId)
      .orderBy(desc(sql`sum(${productionEntries.qty})`), asc(products.name)),
  ]);
  const live = rows.filter((r) => !r.e.voidedAt);
  const units = live.reduce((s, r) => s + r.e.qty, 0);
  const materialCost = live.reduce((s, r) => s + r.e.materialCostP, 0);
  const days = new Set(live.map((r) => r.e.workDate)).size;
  const editable = canEdit(user.role, "factory");

  return (
    <>
      <PageHeader title="Production" description="Everything the factory finished, by month." backHref="/factory" backLabel="Daily register">
        <Link href={`/api/export/production?month=${month}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Download /> Export CSV
        </Link>
      </PageHeader>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
          {[
            ["all", "All brands"],
            ["babygambling", "Baby Gambling"],
            ["firstbon", "Firstbon"],
          ].map(([v, l]) => (
            <Link key={v} href={`/factory/production${qs({ month, brand: v })}`} className={cn("rounded-md px-3 py-1", brand === v ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {l}
            </Link>
          ))}
        </div>
        <MonthNav month={month} basePath="/factory/production" params={{ brand }} />
      </div>
      <StatGrid className="mb-6">
        <Stat label="Units made" value={units} tone="primary" />
        <Stat label="Working days with output" value={days} />
        <Stat label="Average per day" value={days ? Math.round(units / days) : 0} />
        <Stat label="Material cost" value={formatINR(materialCost)} hint="From recipes" />
      </StatGrid>
      <div className="space-y-8">
        {byProduct.length ? (
          <Section title="By product">
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Material cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byProduct.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.name}{r.variant ? ` — ${r.variant}` : ""}</TableCell>
                      <TableCell>{BRAND[r.brandId] ?? r.brandId}</TableCell>
                      <TableCell className="tabular text-right font-medium">{r.units}</TableCell>
                      <TableCell className="tabular text-right">{formatINR(Number(r.cost))}</TableCell>
                    </TableRow>
                  ))}
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
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="hidden sm:table-cell">Made by</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Material cost</TableHead>
                  {editable ? <TableHead className="w-16" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableEmpty colSpan={7}>No production recorded this month.</TableEmpty>
                ) : (
                  rows.map(({ e, name, variant, userName }) => (
                    <TableRow key={e.id} className={cn(e.voidedAt && "opacity-50")}>
                      <TableCell className="whitespace-nowrap">
                        <Link href={`/factory?date=${e.workDate}`} className="hover:underline">{formatDate(e.workDate, "d MMM")}</Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.number}</TableCell>
                      <TableCell>
                        <span className={cn(e.voidedAt && "line-through")}>{name}{variant ? ` — ${variant}` : ""}</span>
                        <span className="block text-xs text-muted-foreground">{BRAND[e.brandId] ?? e.brandId}{e.voidedAt ? ` · voided: ${e.voidReason}` : ""}</span>
                      </TableCell>
                      <TableCell className="tabular text-right font-medium">{e.qty}</TableCell>
                      <TableCell className="hidden sm:table-cell">{e.workerName ?? userName ?? "—"}</TableCell>
                      <TableCell className="tabular hidden text-right md:table-cell">{formatINR(e.materialCostP)}</TableCell>
                      {editable ? (
                        <TableCell className="text-right">
                          {!e.voidedAt ? (
                            <ConfirmAction trigger={<Button variant="ghost" size="xs" className="text-muted-foreground" />} title={`Void ${e.number}?`} description="Finished stock and the materials used will be put back." action={voidProduction} hidden={{ id: e.id }} confirmLabel="Void entry" destructive withReason>
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
