import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Download, Pencil } from "lucide-react";
import { cn } from "cn";
import { voidRecord } from "@/actions/records";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { monthKey, monthRange, formatDate, todayIST } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { canEdit } from "@/lib/permissions";
import { getBankAccounts, getCategories, getContacts, getEntities, PAYMENT_METHOD_LABEL } from "@/lib/queries/common";
import { listRecords, netOf, totalsByKind } from "@/lib/queries/records";
import { int, pick, qs, str } from "@/lib/url";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Amount } from "@/components/app/amount";
import { ConfirmAction } from "@/components/app/confirm-action";
import { MonthNav } from "@/components/app/month-nav";
import { PageHeader } from "@/components/app/page-header";
import { Stat, StatGrid } from "@/components/app/stat";
import { StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCard, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/app/data-table";
import { RecordAttachments } from "./record-attachments";
import { AddRecordButtons, EditRecordDialog } from "./record-dialogs";

export const metadata: Metadata = { title: "Sales & expenses" };

const KIND_TONE = { sale: "success", expense: "destructive", return: "warning", purchase: "info" } as const;

export default async function SalesPage(props: PageProps<"/sales">) {
  const user = await requireUser("sales");
  const sp = await props.searchParams;
  const entityRows = await getEntities();
  const entity = pick(sp.entity, ["all", ...entityRows.map((e) => e.id)], "all");
  const kind = pick(sp.kind, ["all", "sale", "expense", "return", "purchase"], "all");
  const month = /^\d{4}-\d{2}$/.test(String(sp.month ?? "")) ? String(sp.month) : monthKey();
  const q = str(sp.q, 100);
  const page = int(sp.page);
  const voided = sp.voided === "1";
  const [from, to] = monthRange(month);
  const params = { entity, kind, month, q: q || undefined, voided: voided ? "1" : undefined };

  const [list, totals, entities, channels, expenseCats, contacts, banks] = await Promise.all([
    listRecords({ entity, kind, from, to, q, includeVoided: voided, page }),
    totalsByKind({ entity, from, to }),
    getEntities(),
    getCategories("channel"),
    getCategories("expense"),
    getContacts(),
    getBankAccounts(),
  ]);
  const options = {
    entities: entities.map((e) => ({ id: e.id, name: e.name })),
    channels: channels.map((c) => c.name),
    expenseCategories: expenseCats.map((c) => c.name),
    contacts: contacts.map((c) => ({ id: c.id, name: c.name, type: c.type })),
    bankAccounts: banks.map((b) => ({ id: b.id, name: b.name, entityId: b.entityId })),
  };
  const editable = canEdit(user.role, "sales");
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const files = list.rows.length
    ? await db
        .select({ id: uploads.id, refId: uploads.refId, fileName: uploads.fileName, size: uploads.size, createdAt: uploads.createdAt })
        .from(uploads)
        .where(and(eq(uploads.kind, "expense_bill"), inArray(uploads.refId, list.rows.map((r) => r.record.id))))
        .orderBy(desc(uploads.createdAt))
    : [];
  const filesFor = (recordId: string) => files.filter((f) => f.refId === recordId).map((f) => ({ id: f.id, fileName: f.fileName, size: f.size, createdAt: f.createdAt.toISOString() }));

  return (
    <>
      <PageHeader title="Sales & expenses" description="Every rupee in and out, for the brand and the factory separately.">
        {editable ? <AddRecordButtons options={options} defaultEntity={entity === "all" ? "brand" : entity} defaultDate={todayIST()} /> : null}
        <Link href={`/api/export/records${qs(params)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Download /> Export CSV
        </Link>
      </PageHeader>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1 text-sm">
          {[["all", "All books"], ...entityRows.map((e) => [e.id, e.name] as [string, string])].map(([v, l]) => (
            <Link key={v} href={`/sales${qs({ ...params, entity: v, page: undefined })}`} className={cn("rounded-full px-3 py-1", entity === v ? "bg-foreground text-background" : "border bg-card text-muted-foreground hover:text-foreground")}>
              {l}
            </Link>
          ))}
        </div>
        <MonthNav month={month} basePath="/sales" params={{ entity, kind, q: q || undefined }} />
      </div>

      <StatGrid className="mb-5">
        <Stat label="Sales" value={formatINR(totals.sale.total)} hint={`${totals.sale.count} entries`} />
        <Stat label="Expenses" value={formatINR(totals.expense.total)} hint={`${totals.expense.count} entries`} />
        <Stat label="Purchases" value={formatINR(totals.purchase.total)} hint={`${totals.purchase.count} entries`} />
        <Stat label="Net after returns" value={formatINR(netOf(totals))} tone={netOf(totals) >= 0 ? "success" : "destructive"} hint={`Returns ${formatINR(totals.return.total)}`} />
      </StatGrid>

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
          {[
            ["all", "All"],
            ["sale", "Sales"],
            ["expense", "Expenses"],
            ["purchase", "Purchases"],
            ["return", "Returns"],
          ].map(([v, l]) => (
            <Link key={v} href={`/sales${qs({ ...params, kind: v, page: undefined })}`} className={cn("rounded-md px-3 py-1", kind === v ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {l}
            </Link>
          ))}
        </div>
        <form className="flex items-center gap-2" action="/sales">
          <input type="hidden" name="entity" value={entity} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="month" value={month} />
          {voided ? <input type="hidden" name="voided" value="1" /> : null}
          <Input name="q" defaultValue={q} placeholder="Search reference, note, name…" className="w-56" />
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
          <Link href={`/sales${qs({ ...params, voided: voided ? undefined : "1", page: undefined })}`} className="text-xs text-muted-foreground hover:text-foreground">
            {voided ? "Hide voided" : "Show voided"}
          </Link>
        </form>
      </div>

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>No.</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="hidden md:table-cell">Channel / category</TableHead>
              <TableHead className="hidden lg:table-cell">Paid via</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="hidden lg:table-cell">By</TableHead>
              <TableHead className="w-10" />
              {editable ? <TableHead className="w-24" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.rows.length === 0 ? (
              <TableEmpty colSpan={10}>No entries for this filter. Use the buttons above to add today&apos;s sales and expenses.</TableEmpty>
            ) : (
              list.rows.map(({ record: r, contactName, userName }) => (
                <TableRow key={r.id} className={cn(r.voidedAt && "opacity-50")}>
                  <TableCell className="whitespace-nowrap">{formatDate(r.workDate, "d MMM")}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{r.number ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge tone={KIND_TONE[r.kind]}>{r.kind}</StatusBadge>
                    {r.entityId === "factory" ? <span className="ml-1 text-xs text-muted-foreground">Factory</span> : null}
                  </TableCell>
                  <TableCell className="max-w-64">
                    <p className={cn("truncate", r.voidedAt && "line-through")}>{r.reference || r.note || (r.source === "shopify" ? "Website order" : "—")}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {contactName ?? ""}
                      {contactName && r.note && r.reference ? " · " : ""}
                      {r.reference && r.note ? r.note : ""}
                      {r.voidedAt ? ` · voided: ${r.voidReason}` : ""}
                    </p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{r.category || r.channel || "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {PAYMENT_METHOD_LABEL[r.paymentMethod] ?? r.paymentMethod}
                    {r.paymentTerms === "credit" ? <span className="ml-1 text-xs text-warning">unpaid</span> : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount paise={r.amountP} tone={r.kind === "sale" ? "in" : "out"} className="font-medium" />
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{r.source === "shopify" ? "Website" : userName ?? "—"}</TableCell>
                  <TableCell className="px-1">
                    <RecordAttachments recordId={r.id} label={r.number ?? r.reference ?? r.kind} files={filesFor(r.id)} editable={editable && !r.voidedAt} />
                  </TableCell>
                  {editable ? (
                    <TableCell>
                      {!r.voidedAt ? (
                        <div className="flex justify-end gap-1">
                          {r.source === "manual" ? (
                            <EditRecordDialog record={r} options={options} />
                          ) : null}
                          <ConfirmAction
                            trigger={<Button variant="ghost" size="xs" className="text-muted-foreground" />}
                            title={`Void ${r.number ?? "this entry"}?`}
                            description="The entry stays in the history but no longer counts. Add a fresh entry if it was a mistake."
                            action={voidRecord}
                            hidden={{ id: r.id }}
                            confirmLabel="Void entry"
                            destructive
                            withReason
                          >
                            Void
                          </ConfirmAction>
                        </div>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableCard>

      {pages > 1 ? (
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {list.total} entries · page {list.page} of {pages}
          </span>
          <div className="flex gap-2">
            {list.page > 1 ? <Link href={`/sales${qs({ ...params, page: list.page - 1 })}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Previous</Link> : null}
            {list.page < pages ? <Link href={`/sales${qs({ ...params, page: list.page + 1 })}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Next</Link> : null}
          </div>
        </div>
      ) : null}
      <Pencil className="hidden" />
    </>
  );
}
