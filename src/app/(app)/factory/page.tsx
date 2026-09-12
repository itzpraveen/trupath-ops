import { productionOrderOptions } from "@/lib/queries/production";
import { QcDialog } from "./qc-dialog";
import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, lte, inArray } from "drizzle-orm";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "cn";
import { voidProduction } from "@/actions/factory";
import { db } from "@/db";
import { attendance, boms, contacts, jobWorkOrders, productionEntries, products, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { addDays, formatDate, isYmd, todayIST } from "@/lib/dates";
import { formatQty } from "@/lib/money";
import { canEdit } from "@/lib/permissions";
import { getEmployees, getProductOptions } from "@/lib/queries/common";
import { lowMaterials } from "@/lib/queries/dashboard";
import { activeRecipes, planRows, toPlanOptions } from "@/lib/queries/factory";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/app/confirm-action";
import { PageHeader, Section } from "@/components/app/page-header";
import { Stat, StatGrid } from "@/components/app/stat";
import { StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCard, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/app/data-table";
import { AttendanceBoard, type AttendanceRow } from "./attendance-board";
import { ProductionDialog } from "./production-dialog";

export const metadata: Metadata = { title: "Daily register" };
const BRAND: Record<string, string> = { babygambling: "Baby Gambling", firstbon: "Firstbon" };

export default async function FactoryPage(props: PageProps<"/factory">) {
  const user = await requireUser("factory");
  const sp = await props.searchParams;
  const today = todayIST();
  const date = isYmd(typeof sp.date === "string" ? sp.date : undefined) ? String(sp.date) : today;
  const editable = canEdit(user.role, "factory");

  const [entries, staff, marks, productOptions, lowMat, bomRows, dueJobs] = await Promise.all([
    db
      .select({ e: productionEntries, name: products.name, variant: products.variant, userName: users.name })
      .from(productionEntries)
      .innerJoin(products, eq(products.id, productionEntries.productId))
      .leftJoin(users, eq(users.id, productionEntries.userId))
      .where(eq(productionEntries.workDate, date))
      .orderBy(asc(productionEntries.createdAt)),
    getEmployees(true),
    db.select().from(attendance).where(eq(attendance.workDate, date)),
    getProductOptions(),
    lowMaterials(6),
    db.select({ productId: boms.productId }).from(boms).where(eq(boms.active, true)),
    db
      .select({ id: jobWorkOrders.id, number: jobWorkOrders.number, dueDate: jobWorkOrders.dueDate, vendor: contacts.name, process: jobWorkOrders.process, orderedQty: jobWorkOrders.orderedQty, receivedQty: jobWorkOrders.receivedQty })
      .from(jobWorkOrders)
      .innerJoin(contacts, eq(contacts.id, jobWorkOrders.vendorId))
      .where(and(inArray(jobWorkOrders.status, ["sent", "partial"]), lte(jobWorkOrders.dueDate, addDays(date, 3))))
      .orderBy(asc(jobWorkOrders.dueDate))
      .limit(5),
  ]);
  const [orderOptions, plans, recipes] = await Promise.all([productionOrderOptions(), planRows({ status: ["open"], today }), activeRecipes()]);
  const planOpts = toPlanOptions(plans);
  const dialogRecipes = Object.fromEntries([...recipes].map(([productId, r]) => [productId, { lines: r.lines }]));
  const dueSoon = plans.filter((r) => r.remaining > 0 && r.plan.targetDate <= addDays(today, 2));
  const live = entries.filter((r) => !r.e.voidedAt);
  const units = live.reduce((s, r) => s + r.e.qty, 0);
  const markMap = new Map(marks.map((m) => [m.employeeId, m]));
  const rows: AttendanceRow[] = staff.map((s) => {
    const m = markMap.get(s.id);
    return { employeeId: s.id, code: s.code, name: s.name, designation: s.designation, status: m?.status ?? null, checkIn: m?.checkIn ?? null, checkOut: m?.checkOut ?? null, overtimeMin: m?.overtimeMin ?? 0, note: m?.note ?? null };
  });
  const present = rows.filter((r) => r.status === "present" || r.status === "half_day").length;
  const unmarked = rows.filter((r) => !r.status).length;

  return (
    <>
      <PageHeader title="Daily register" description="Record what the factory made, who came in, and what is running low.">
        {editable ? <ProductionDialog products={productOptions} employees={staff.map((s) => ({ id: s.id, name: s.name }))} date={date} bomProductIds={bomRows.map((b) => b.productId)} orders={orderOptions} plans={planOpts} recipes={dialogRecipes} /> : null}
      </PageHeader>

      <div className="mb-5 flex items-center gap-2">
        <Link href={`/factory?date=${addDays(date, -1)}`} aria-label="Previous day" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronLeft />
        </Link>
        <div className="min-w-44 text-center">
          <p className="text-sm font-semibold">{formatDate(date, "EEEE, d MMM yyyy")}</p>
          {date !== today ? (
            <Link href="/factory" className="text-xs text-primary hover:underline">
              Back to today
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground">Today</p>
          )}
        </div>
        <Link href={`/factory?date=${addDays(date, 1)}`} aria-label="Next day" className={cn(buttonVariants({ variant: "outline", size: "icon" }), date >= today && "pointer-events-none opacity-40")}>
          <ChevronRight />
        </Link>
      </div>

      <StatGrid className="mb-6">
        <Stat label="Units made" value={units} hint={`${live.length} ${live.length === 1 ? "entry" : "entries"}`} tone="primary" />
        <Stat label="Staff present" value={present} hint={`of ${rows.length}${unmarked ? ` · ${unmarked} not marked` : ""}`} tone={unmarked && date === today ? "warning" : "default"} />
        <Stat label="Materials low" value={lowMat.length} tone={lowMat.length ? "warning" : "default"} />
        <Stat label="Job work due" value={dueJobs.length} hint="within 3 days" />
      </StatGrid>

      <div className="space-y-8">
        <Section title="On the plan" description={dueSoon.length ? "Batches due in the next two days, oldest first." : undefined} actions={<Link href="/factory/plan" className="text-sm text-primary hover:underline">Production plan</Link>}>
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {dueSoon.length ? (
              dueSoon.slice(0, 8).map((r) => (
                <li key={r.plan.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <span className="min-w-0">
                    <span className="font-medium">{r.name}{r.variant ? ` — ${r.variant}` : ""}</span>
                    <span className="block text-xs text-muted-foreground">{r.plan.number} · due {formatDate(r.plan.targetDate, "d MMM")}{r.overdue ? " · overdue" : ""}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabular text-sm">{r.remaining} to make</span>
                    {!r.recipe ? <StatusBadge tone="neutral">No recipe</StatusBadge> : r.shortCount ? <StatusBadge tone="warning">{r.shortCount} short</StatusBadge> : <StatusBadge tone="success">Enough</StatusBadge>}
                  </span>
                </li>
              ))
            ) : (
              <li className="p-3 text-muted-foreground">Nothing planned for the next two days. {plans.length ? "Later batches are on the production plan." : "Plan a batch to check materials before the team starts."}</li>
            )}
          </ul>
        </Section>
        <Section title="Orders to make" actions={<Link href="/factory/production?qc=pending" className="text-sm text-primary underline">Open QC queue</Link>}>
          <p className="mb-2 text-sm text-muted-foreground">Remaining order quantities before using existing stock. Choose an order in Record production to link its progress.</p>
          <ul className="divide-y rounded-xl border bg-card text-sm">{orderOptions.filter(o => o.remaining || o.awaitingQc).map(o => <li key={`${o.orderId}:${o.lineId}`} className="flex flex-wrap justify-between gap-2 p-3"><span>{o.label}</span><span>{o.remaining} to make · {o.awaitingQc} awaiting QC · {o.accepted} accepted</span></li>)}{!orderOptions.some(o => o.remaining || o.awaitingQc) ? <li className="p-3 text-muted-foreground">No mapped website orders waiting for production or QC.</li> : null}</ul>
        </Section>
        <Section title="Made on this day" actions={<Link href="/factory/production" className="text-sm text-primary hover:underline">Production history</Link>}>
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No.</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead><TableHead>QC</TableHead>
                  <TableHead className="hidden sm:table-cell">Made by</TableHead>
                  <TableHead className="hidden md:table-cell">Note</TableHead>
                  {editable ? <TableHead className="w-16" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.length === 0 ? (
                  <TableEmpty colSpan={6}>Nothing recorded for this day yet.{editable ? " Use “Record production” to add the first entry." : ""}</TableEmpty>
                ) : (
                  entries.map(({ e, name, variant, userName }) => (
                    <TableRow key={e.id} className={cn(e.voidedAt && "opacity-50")}>
                      <TableCell className="text-xs text-muted-foreground">{e.number}</TableCell>
                      <TableCell>
                        <span className={cn(e.voidedAt && "line-through")}>
                          {name}
                          {variant ? ` — ${variant}` : ""}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {BRAND[e.brandId] ?? e.brandId}
                          {e.voidedAt ? ` · voided: ${e.voidReason}` : ""}
                        </span>
                      </TableCell>
                      <TableCell className="tabular text-right font-semibold">{e.qty}</TableCell>
                      <TableCell><span className="block text-xs">{e.acceptedQty} accepted · {e.rejectedQty} rejected</span><span className="block text-xs text-muted-foreground">{e.qcRequired ? `${e.qty - e.acceptedQty - e.rejectedQty} awaiting QC` : "Recorded before QC workflow"}</span>{!e.voidedAt && e.qcRequired && editable ? <QcDialog entry={e} /> : null}</TableCell>
                      <TableCell className="hidden sm:table-cell">{e.workerName ?? userName ?? "—"}</TableCell>
                      <TableCell className="hidden max-w-56 truncate text-muted-foreground md:table-cell">{e.note ?? ""}</TableCell>
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

        <Section title="Attendance" description="Tap to mark. P present, ½ half day, A absent, L leave." actions={<Link href="/factory/attendance" className="text-sm text-primary hover:underline">Monthly view</Link>}>
          <AttendanceBoard rows={rows} date={date} editable={canEdit(user.role, "attendance")} />
        </Section>

        <div className="grid gap-6 md:grid-cols-2">
          <Section title="Materials running low" actions={<Link href="/factory/materials" className="text-sm text-primary hover:underline">All materials</Link>}>
            {lowMat.length ? (
              <ul className="divide-y rounded-xl border bg-card text-sm">
                {lowMat.map((m) => (
                  <li key={m.id} className="flex items-center justify-between px-4 py-2">
                    <Link href={`/factory/materials/${m.id}`} className="min-w-0 truncate hover:underline">
                      {m.name}
                    </Link>
                    <span className="tabular shrink-0 text-warning">
                      {formatQty(m.qty, m.unit)} <span className="text-muted-foreground">/ min {formatQty(m.minQty)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">Everything is above minimum.</p>
            )}
          </Section>
          <Section title="Job work due" actions={<Link href="/jobwork" className="text-sm text-primary hover:underline">All job work</Link>}>
            {dueJobs.length ? (
              <ul className="divide-y rounded-xl border bg-card text-sm">
                {dueJobs.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-2 px-4 py-2">
                    <Link href={`/jobwork/${j.id}`} className="min-w-0 truncate hover:underline">
                      {j.number} · {j.vendor} · {j.process}
                    </Link>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">
                      {j.receivedQty}/{j.orderedQty} · due {formatDate(j.dueDate, "d MMM")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">Nothing due in the next 3 days.</p>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
