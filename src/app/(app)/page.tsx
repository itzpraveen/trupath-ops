import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { canView } from "@/lib/permissions";
import { addDays, formatDate, formatDateTime, monthKey, monthRange, shiftMonth, todayIST } from "@/lib/dates";
import { formatINR, formatQty } from "@/lib/money";
import { isShopifyConfigured, getLastSync } from "@/lib/shopify";
import { netOf, totalsByKind } from "@/lib/queries/records";
import { attendanceOnDate, channelSplit, dailySeries, dispatchCounts, factoryOnDate, lowMaterials, lowStock, ordersSummary, productionInRange, recentRecords } from "@/lib/queries/dashboard";
import { getBankAccounts, getCategories, getContacts, getEntities } from "@/lib/queries/common";
import { PageHeader, Section } from "@/components/app/page-header";
import { Stat, StatGrid } from "@/components/app/stat";
import { Amount } from "@/components/app/amount";
import { SalesExpensesChart } from "@/components/app/charts";
import { EmptyState } from "@/components/app/empty-state";
import { AddRecordButtons } from "./sales/record-dialogs";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "cn";

const BRAND: Record<string, string> = { babygambling: "Baby Gambling", firstbon: "Firstbon" };

export default async function DashboardPage(props: PageProps<"/">) {
  const user = await requireUser("dashboard");
  const sp = await props.searchParams;
  const entity = typeof sp.entity === "string" && ["brand", "factory", "all"].includes(sp.entity) ? sp.entity : "all";
  const today = todayIST();
  const month = monthKey(today);
  const [mFrom, mTo] = monthRange(month);
  const [pFrom, pTo] = monthRange(shiftMonth(month, -1));
  const seriesFrom = addDays(today, -29);

  const showMoney = canView(user.role, "sales");
  const showFactory = canView(user.role, "factory");
  const showStock = canView(user.role, "stock");
  const showOrders = canView(user.role, "orders");

  const [todayTotals, monthTotals, prevTotals, series, channels, recent, entities, channelsList, expenseCats, contacts, banks] = showMoney
    ? await Promise.all([
        totalsByKind({ entity, from: today, to: today }),
        totalsByKind({ entity, from: mFrom, to: mTo }),
        totalsByKind({ entity, from: pFrom, to: pTo }),
        dailySeries(entity, seriesFrom, today),
        channelSplit(entity, mFrom, mTo),
        recentRecords(8),
        getEntities(),
        getCategories("channel"),
        getCategories("expense"),
        getContacts(),
        getBankAccounts(),
      ])
    : [null, null, null, null, null, null, null, null, null, null, null];

  const [factoryToday, monthProduction, attendance, lowMat] = showFactory
    ? await Promise.all([factoryOnDate(today), productionInRange(mFrom, mTo), attendanceOnDate(today), lowMaterials(6)])
    : [null, null, null, null];
  const [lows, dispatch] = showStock ? await Promise.all([lowStock(6), dispatchCounts()]) : [null, null];
  const shopifyOn = isShopifyConfigured();
  const orders = showOrders && shopifyOn ? await ordersSummary(new Date(`${today}T00:00:00+05:30`), mFrom, mTo) : null;
  const lastSync = showOrders ? await getLastSync() : null;

  const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);

  return (
    <>
      <PageHeader title={`Good ${greeting()}, ${user.name.split(" ")[0]}`} description={`${formatDate(today, "EEEE, d MMMM yyyy")}${entity !== "all" ? ` · ${entity === "brand" ? "Trupaths Ventures books" : "Factory books"}` : ""}`}>
        {showMoney && entities && channelsList && expenseCats && contacts && banks ? (
          <AddRecordButtons
            kinds={["sale", "expense"]}
            defaultEntity={entity === "factory" ? "factory" : "brand"}
            defaultDate={today}
            options={{
              entities: entities.map((e) => ({ id: e.id, name: e.name })),
              channels: channelsList.map((c) => c.name),
              expenseCategories: expenseCats.map((c) => c.name),
              contacts: contacts.map((c) => ({ id: c.id, name: c.name, type: c.type })),
              bankAccounts: banks.map((b) => ({ id: b.id, name: b.name, entityId: b.entityId })),
            }}
          />
        ) : null}
      </PageHeader>

      {showMoney ? (
        <div className="mb-5 flex flex-wrap items-center gap-1 text-sm">
          {[
            ["all", "All books"],
            ["brand", "Trupaths Ventures"],
            ["factory", "Factory"],
          ].map(([v, l]) => (
            <Link key={v} href={v === "all" ? "/" : `/?entity=${v}`} className={cn("rounded-full px-3 py-1", entity === v ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground border")}>
              {l}
            </Link>
          ))}
        </div>
      ) : null}

      {showOrders && !shopifyOn ? (
        <div className="mb-5 flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <p>
              <span className="font-medium">Website orders are not syncing yet.</span> Connect the Shopify store so sales, refunds and stock update on their own.
            </p>
          </div>
          {user.role === "owner" ? (
            <Link href="/settings/shopify" className={cn(buttonVariants({ size: "sm", variant: "outline" }), "shrink-0")}>
              Connect Shopify
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-8">
        {showMoney && todayTotals && monthTotals && prevTotals && series ? (
          <>
            <Section title="Today">
              <StatGrid>
                <Stat label="Sales today" value={formatINR(todayTotals.sale.total)} hint={`${todayTotals.sale.count} ${todayTotals.sale.count === 1 ? "sale" : "sales"}`} tone="primary" />
                <Stat label="Expenses today" value={formatINR(todayTotals.expense.total + todayTotals.purchase.total)} hint={`${todayTotals.expense.count + todayTotals.purchase.count} entries`} />
                {orders ? <Stat label="Website orders today" value={orders.today} hint={orders.open ? `${orders.open} waiting to ship` : "All shipped"} /> : showFactory && factoryToday ? <Stat label="Produced today" value={factoryToday.units} hint={`${factoryToday.entries} entries`} /> : <Stat label="Returns today" value={formatINR(todayTotals.return.total)} />}
                {dispatch ? <Stat label="Dispatch pending" value={(dispatch.pending ?? 0) + (dispatch.packed ?? 0)} hint={`${dispatch.shipped ?? 0} on the way`} tone={(dispatch.pending ?? 0) > 0 ? "warning" : "default"} /> : <Stat label="Returns today" value={formatINR(todayTotals.return.total)} />}
              </StatGrid>
            </Section>

            <Section title={`This month`} description={formatDate(mFrom, "MMMM yyyy")} actions={<Link href={`/sales?entity=${entity}`} className="text-sm text-primary hover:underline">Open ledger</Link>}>
              <StatGrid>
                <Stat label="Sales" value={formatINR(monthTotals.sale.total)} hint={trend(pct(monthTotals.sale.total, prevTotals.sale.total), "vs last month")} />
                <Stat label="Expenses & purchases" value={formatINR(monthTotals.expense.total + monthTotals.purchase.total)} hint={trend(pct(monthTotals.expense.total + monthTotals.purchase.total, prevTotals.expense.total + prevTotals.purchase.total), "vs last month")} />
                <Stat label="Returns" value={formatINR(monthTotals.return.total)} hint={`${monthTotals.return.count} refunds`} />
                <Stat label="Net" value={formatINR(netOf(monthTotals))} tone={netOf(monthTotals) >= 0 ? "success" : "destructive"} hint="Sales minus returns, expenses and purchases" />
              </StatGrid>
              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div className="rounded-xl border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-medium">Last 30 days</p>
                    <p className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-chart-1" /> Sales</span>
                      <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-chart-2" /> Expenses</span>
                    </p>
                  </div>
                  <SalesExpensesChart data={series} />
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <p className="mb-3 text-sm font-medium">Sales by channel</p>
                  {channels && channels.length ? (
                    <ul className="space-y-2.5">
                      {channels.map((c) => {
                        const share = monthTotals.sale.total ? Math.round((Number(c.total) / monthTotals.sale.total) * 100) : 0;
                        return (
                          <li key={c.channel || "none"} className="text-sm">
                            <div className="flex justify-between">
                              <span className="truncate">{c.channel || "Unspecified"}</span>
                              <Amount paise={Number(c.total)} className="font-medium" />
                            </div>
                            <div className="mt-1 h-1.5 rounded-full bg-muted">
                              <div className="h-1.5 rounded-full bg-chart-1" style={{ width: `${share}%` }} />
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">{share}% · {c.n} {c.n === 1 ? "sale" : "sales"}</p>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No sales recorded this month yet.</p>
                  )}
                </div>
              </div>
            </Section>
          </>
        ) : null}

        {showOrders && orders ? (
          <Section title="Website orders" description={lastSync?.lastOk ? `Synced ${formatDateTime(lastSync.lastOk.startedAt)}` : "Not synced yet"} actions={<Link href="/orders" className="text-sm text-primary hover:underline">All orders</Link>}>
            <StatGrid className="mb-3">
              <Stat label="Waiting to ship" value={orders.open} tone={orders.open > 0 ? "warning" : "default"} />
              <Stat label="Orders this month" value={orders.monthCount} />
              <Stat label="Website revenue this month" value={formatINR(orders.monthTotal)} />
              <Stat label="Today" value={orders.today} />
            </StatGrid>
            {orders.recent.length ? (
              <ul className="divide-y rounded-xl border bg-card">
                {orders.recent.map((o) => (
                  <li key={o.id}>
                    <Link href={`/orders/${o.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                      <span className="w-16 font-medium">{o.name}</span>
                      <span className="min-w-0 flex-1 truncate">{o.customerName}{o.city ? `, ${o.city}` : ""}</span>
                      <span className="hidden text-xs text-muted-foreground sm:block">{o.fulfillmentStatus.toLowerCase().replace("_", " ")}</span>
                      <Amount paise={o.totalP} className="font-medium" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No orders synced yet" description="Run a sync from the orders page once Shopify is connected." />
            )}
          </Section>
        ) : null}

        {showFactory && factoryToday && attendance && monthProduction ? (
          <Section title="Factory today" actions={<Link href="/factory" className="text-sm text-primary hover:underline">Open register</Link>}>
            <StatGrid className="mb-3">
              <Stat label="Units produced today" value={factoryToday.units} hint={`${monthProduction.units} this month`} tone="primary" />
              <Stat label="Present" value={attendance.present + attendance.half_day} hint={`${attendance.total} staff · ${attendance.unmarked} not marked`} />
              <Stat label="Absent / leave" value={attendance.absent + attendance.leave} />
              <Stat label="Materials running low" value={lowMat?.length ?? 0} tone={lowMat && lowMat.length ? "warning" : "default"} />
            </StatGrid>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border bg-card p-4">
                <p className="mb-2 text-sm font-medium">Made today</p>
                {factoryToday.byProduct.length ? (
                  <ul className="divide-y text-sm">
                    {factoryToday.byProduct.map((r) => (
                      <li key={`${r.productId}-${r.brandId}`} className="flex justify-between py-1.5">
                        <span className="min-w-0 truncate">{r.name}{r.variant ? ` — ${r.variant}` : ""} <span className="text-muted-foreground">· {BRAND[r.brandId] ?? r.brandId}</span></span>
                        <span className="tabular font-medium">{r.units}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing recorded yet today. <Link href="/factory" className="text-primary hover:underline">Record production</Link></p>
                )}
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="mb-2 text-sm font-medium">Raw materials to reorder</p>
                {lowMat && lowMat.length ? (
                  <ul className="divide-y text-sm">
                    {lowMat.map((m) => (
                      <li key={m.id} className="flex justify-between py-1.5">
                        <span className="min-w-0 truncate">{m.name}</span>
                        <span className="tabular text-warning">{formatQty(m.qty, m.unit)} <span className="text-muted-foreground">/ min {formatQty(m.minQty)}</span></span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">All materials are above their minimum.</p>
                )}
              </div>
            </div>
          </Section>
        ) : null}

        {showStock && lows ? (
          <Section title="Finished stock" actions={<Link href="/stock" className="text-sm text-primary hover:underline">All stock</Link>}>
            {lows.length ? (
              <ul className="divide-y rounded-xl border bg-card text-sm">
                {lows.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0 truncate">{p.name}{p.variant ? ` — ${p.variant}` : ""} <span className="text-muted-foreground">· {BRAND[p.brandId] ?? p.brandId}</span></span>
                    <span className="tabular shrink-0 text-warning">{p.stockQty} <span className="text-muted-foreground">/ min {p.minStock}</span></span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">No product is below its minimum stock. Set minimums on the products page to get alerts here.</p>
            )}
          </Section>
        ) : null}

        {showMoney && recent ? (
          <Section title="Recent entries">
            {recent.length ? (
              <ul className="divide-y rounded-xl border bg-card text-sm">
                {recent.map(({ record: r, userName }) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-20 shrink-0 text-muted-foreground">{formatDate(r.workDate, "d MMM")}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="capitalize">{r.kind}</span>
                      {r.reference ? ` · ${r.reference}` : ""}
                      {r.category ? ` · ${r.category}` : r.channel ? ` · ${r.channel}` : ""}
                      <span className="text-muted-foreground"> · {r.source === "shopify" ? "Website" : userName ?? ""}</span>
                    </span>
                    <Amount paise={r.amountP} tone={r.kind === "sale" ? "in" : "out"} className="font-medium" />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No entries yet" description="Add today's sales and expenses, or connect Shopify to bring website orders in automatically.">
                <Link href="/sales" className={buttonVariants({ variant: "outline", size: "sm" })}>Go to sales & expenses <ArrowRight /></Link>
              </EmptyState>
            )}
          </Section>
        ) : null}

        {!showMoney && !showFactory && !showStock ? (
          <EmptyState title="Nothing to show for your role yet" description="Ask the owner to give you access to a module.">
            <Button variant="outline" size="sm" render={<Link href="/account" />}>Account</Button>
          </EmptyState>
        ) : null}
      </div>
    </>
  );
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

function trend(p: number | null, label: string) {
  if (p === null) return label;
  const sign = p > 0 ? "+" : "";
  return `${sign}${p}% ${label}`;
}
