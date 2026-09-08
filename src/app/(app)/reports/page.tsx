import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { cn } from "cn";
import { requireUser } from "@/lib/auth";
import { formatDate, fyRange, monthKey, monthLabel, monthRange, todayIST } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { channelSplit, expenseByCategory, productionInRange } from "@/lib/queries/dashboard";
import { netOf, totalsByKind } from "@/lib/queries/records";
import { gstSummary, monthlyTrend, stockValuation, topWebsiteProducts } from "@/lib/queries/reports";
import { isShopifyConfigured } from "@/lib/shopify";
import { pick, qs } from "@/lib/url";
import { getEntities } from "@/lib/queries/common";
import { buttonVariants } from "@/components/ui/button";
import { Amount } from "@/components/app/amount";
import { MonthNav } from "@/components/app/month-nav";
import { PageHeader, Section } from "@/components/app/page-header";
import { Stat, StatGrid } from "@/components/app/stat";
import { Table, TableBody, TableCard, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/app/data-table";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage(props: PageProps<"/reports">) {
  await requireUser("reports");
  const sp = await props.searchParams;
  const entityRows = await getEntities();
  const entity = pick(sp.entity, ["all", ...entityRows.map((e) => e.id)], "all");
  const period = pick(sp.period, ["month", "fy"], "month");
  const month = /^\d{4}-\d{2}$/.test(String(sp.month ?? "")) ? String(sp.month) : monthKey();
  const [from, to] = period === "fy" ? fyRange(todayIST()) : monthRange(month);
  const label = period === "fy" ? `Financial year ${from.slice(0, 4)}-${to.slice(2, 4)} (to date)` : monthLabel(month);
  const params = { entity, period, month };
  const shopifyOn = await isShopifyConfigured();

  const [totals, byCategory, channels, trend, gst, valuation, production, top] = await Promise.all([
    totalsByKind({ entity, from, to }),
    expenseByCategory(entity, from, to),
    channelSplit(entity, from, to),
    monthlyTrend(entity, 12),
    gstSummary(entity, from, to),
    stockValuation(),
    productionInRange(from, to),
    shopifyOn ? topWebsiteProducts(from, to, 10, entity) : Promise.resolve([]),
  ]);
  const net = netOf(totals);
  const netSales = totals.sale.total - totals.return.total;
  const outgoings = totals.expense.total + totals.purchase.total;

  return (
    <>
      <PageHeader title="Reports" description={`${label} · ${entity === "all" ? "all books" : entityRows.find((e) => e.id === entity)?.name ?? entity}`}>
        <Link href={`/api/export/records${qs({ entity, from, to })}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Download /> Ledger CSV
        </Link>
      </PageHeader>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 text-sm">
            {[["all", "All books"], ...entityRows.map((e) => [e.id, e.name] as [string, string])].map(([v, l]) => (
              <Link key={v} href={`/reports${qs({ ...params, entity: v })}`} className={cn("rounded-full px-3 py-1", entity === v ? "bg-foreground text-background" : "border bg-card text-muted-foreground hover:text-foreground")}>
                {l}
              </Link>
            ))}
          </div>
          <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
            {[
              ["month", "Month"],
              ["fy", "Financial year"],
            ].map(([v, l]) => (
              <Link key={v} href={`/reports${qs({ ...params, period: v })}`} className={cn("rounded-md px-3 py-1", period === v ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {l}
              </Link>
            ))}
          </div>
        </div>
        {period === "month" ? <MonthNav month={month} basePath="/reports" params={{ entity, period }} /> : <span className="text-sm text-muted-foreground">{formatDate(from)} to {formatDate(to)}</span>}
      </div>

      <div className="space-y-8">
        <Section title="Profit summary" description="Cash-basis view from the ledger. Not a substitute for your accountant's statements.">
          <StatGrid>
            <Stat label="Sales" value={formatINR(totals.sale.total)} hint={`${totals.sale.count} entries`} />
            <Stat label="Returns" value={formatINR(totals.return.total)} hint={`${totals.return.count} entries`} />
            <Stat label="Net sales" value={formatINR(netSales)} tone="primary" />
            <Stat label="Net result" value={formatINR(net)} tone={net >= 0 ? "success" : "destructive"} hint={`after ${formatINR(outgoings)} of expenses & purchases`} />
          </StatGrid>
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Expenses & purchases by category">
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Entries</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byCategory.length === 0 ? (
                    <TableEmpty colSpan={4}>No expenses in this period.</TableEmpty>
                  ) : (
                    byCategory.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          {c.category || "Uncategorised"} <span className="text-xs text-muted-foreground">{c.kind === "purchase" ? "purchase" : ""}</span>
                        </TableCell>
                        <TableCell className="tabular text-right">{c.n}</TableCell>
                        <TableCell className="text-right"><Amount paise={Number(c.total)} /></TableCell>
                        <TableCell className="tabular text-right text-muted-foreground">{outgoings ? Math.round((Number(c.total) / outgoings) * 100) : 0}%</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableCard>
          </Section>
          <Section title="Sales by channel">
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Avg</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {channels.length === 0 ? (
                    <TableEmpty colSpan={4}>No sales in this period.</TableEmpty>
                  ) : (
                    channels.map((c) => (
                      <TableRow key={c.channel || "none"}>
                        <TableCell>{c.channel || "Unspecified"}</TableCell>
                        <TableCell className="tabular text-right">{c.n}</TableCell>
                        <TableCell className="text-right"><Amount paise={Number(c.total)} /></TableCell>
                        <TableCell className="tabular text-right text-muted-foreground">{formatINR(Math.round(Number(c.total) / Math.max(1, Number(c.n))))}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableCard>
          </Section>
        </div>

        <Section title="Last 12 months">
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Returns</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Purchases</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trend.map((m) => (
                  <TableRow key={m.ym} className={cn(m.ym === month && period === "month" && "bg-accent/40")}>
                    <TableCell>
                      <Link href={`/reports${qs({ entity, period: "month", month: m.ym })}`} className="hover:underline">{monthLabel(m.ym)}</Link>
                    </TableCell>
                    <TableCell className="text-right"><Amount paise={m.sales} /></TableCell>
                    <TableCell className="hidden text-right sm:table-cell"><Amount paise={m.returns} /></TableCell>
                    <TableCell className="text-right"><Amount paise={m.expenses} /></TableCell>
                    <TableCell className="hidden text-right sm:table-cell"><Amount paise={m.purchases} /></TableCell>
                    <TableCell className="text-right"><Amount paise={m.net} tone={m.net < 0 ? "out" : "neutral"} className="font-medium" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          {top.length ? (
            <Section title="Website best sellers" description="From synced Shopify orders in this period.">
              <TableCard>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Pieces</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {top.map((t) => (
                      <TableRow key={t.title}>
                        <TableCell className="max-w-64 truncate">{t.title}</TableCell>
                        <TableCell className="tabular text-right font-medium">{t.qty}</TableCell>
                        <TableCell className="text-right"><Amount paise={t.value} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableCard>
            </Section>
          ) : null}
          <Section title="GST at a glance" description="Output tax from website orders (tax-inclusive prices, before refunds) and from other sales with GST entered; input GST from bills with GST entered. Indicative only.">
            <StatGrid className="lg:grid-cols-2">
              <Stat label="Output GST (website)" value={formatINR(gst.websiteTax)} hint={`${gst.websiteOrders} orders · ${formatINR(gst.websiteTotal)} gross`} />
              <Stat label="Output GST (other sales)" value={formatINR(gst.salesGst - gst.returnsGst)} hint={`${gst.salesInvoices} invoices${gst.returnsGst ? ` · less ${formatINR(gst.returnsGst)} on returns` : ""}`} />
              <Stat label="Input GST on bills" value={formatINR(gst.inputGst)} hint={`${gst.inputBills} bills with GST`} />
              <Stat label="Net GST (approx.)" value={formatINR(gst.websiteTax + gst.salesGst - gst.returnsGst - gst.inputGst)} hint="output minus input" tone={gst.websiteTax + gst.salesGst - gst.returnsGst - gst.inputGst > 0 ? "warning" : "default"} />
            </StatGrid>
          </Section>
        </div>

        <Section title="Production & stock" description="Stock values are as of now, not the period.">
          <StatGrid>
            <Stat label="Units produced" value={production.units} hint={`${production.entries} entries in period`} />
            <Stat label="Finished stock" value={valuation.fgUnits} hint={`${formatINR(Math.round(valuation.fgValue))} at cost · ${formatINR(Math.round(valuation.fgRetail))} at price`} />
            <Stat label="Raw material value" value={formatINR(Math.round(valuation.rmValue))} hint={`${valuation.rmItems} materials`} />
            <Stat label="Stock at cost" value={formatINR(Math.round(valuation.fgValue + valuation.rmValue))} hint="finished + raw" />
          </StatGrid>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/api/export/production${qs({ from, to })}`} className={buttonVariants({ variant: "outline", size: "sm" })}><Download /> Production CSV</Link>
            <Link href="/api/export/stock" className={buttonVariants({ variant: "outline", size: "sm" })}><Download /> Stock CSV</Link>
            <Link href="/api/export/materials" className={buttonVariants({ variant: "outline", size: "sm" })}><Download /> Materials CSV</Link>
            <Link href={`/api/export/attendance${qs({ from, to })}`} className={buttonVariants({ variant: "outline", size: "sm" })}><Download /> Attendance CSV</Link>
          </div>
        </Section>
      </div>
    </>
  );
}
