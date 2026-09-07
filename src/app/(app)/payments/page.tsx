import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { cn } from "cn";
import { voidPayment } from "@/actions/payments";
import { db } from "@/db";
import { bankAccounts, contacts, payments } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDate, monthKey, monthRange, todayIST } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { canEdit } from "@/lib/permissions";
import { getContacts, PAYMENT_METHOD_LABEL } from "@/lib/queries/common";
import { accountBalances, outstandingLists } from "@/lib/queries/money";
import { pick, qs } from "@/lib/url";
import { Button } from "@/components/ui/button";
import { Amount } from "@/components/app/amount";
import { ConfirmAction } from "@/components/app/confirm-action";
import { MonthNav } from "@/components/app/month-nav";
import { PageHeader } from "@/components/app/page-header";
import { Stat, StatGrid } from "@/components/app/stat";
import { Table, TableBody, TableCard, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/app/data-table";
import { BankAccountDialog, PaymentDialog } from "./payment-dialogs";

export const metadata: Metadata = { title: "Payments" };
const TYPE_LABEL: Record<string, string> = { cash: "Cash", bank: "Bank", upi: "UPI", wallet: "Wallet" };

export default async function PaymentsPage(props: PageProps<"/payments">) {
  const user = await requireUser("payments");
  const sp = await props.searchParams;
  const tab = pick(sp.tab, ["payments", "accounts", "receivables", "payables"], "payments");
  const entity = pick(sp.entity, ["all", "brand", "factory"], "all");
  const month = /^\d{4}-\d{2}$/.test(String(sp.month ?? "")) ? String(sp.month) : monthKey();
  const [from, to] = monthRange(month);
  const editable = canEdit(user.role, "payments");
  const today = todayIST();

  const [rows, balances, outstanding, contactList] = await Promise.all([
    db
      .select({ p: payments, contactName: contacts.name, accountName: bankAccounts.name })
      .from(payments)
      .leftJoin(contacts, eq(contacts.id, payments.contactId))
      .leftJoin(bankAccounts, eq(bankAccounts.id, payments.bankAccountId))
      .where(and(gte(payments.workDate, from), lte(payments.workDate, to), entity === "all" ? undefined : eq(payments.entityId, entity)))
      .orderBy(desc(payments.workDate), desc(payments.createdAt)),
    accountBalances(),
    outstandingLists(),
    getContacts(),
  ]);
  const live = rows.filter((r) => !r.p.voidedAt);
  const inTotal = live.filter((r) => r.p.direction === "in").reduce((s, r) => s + r.p.amountP, 0);
  const outTotal = live.filter((r) => r.p.direction === "out").reduce((s, r) => s + r.p.amountP, 0);
  const recvTotal = outstanding.receivables.reduce((s, r) => s + r.amount, 0);
  const payTotal = outstanding.payables.reduce((s, r) => s + r.amount, 0);
  const cash = balances.filter((b) => b.active).reduce((s, b) => s + b.balanceP, 0);
  const contactOptions = contactList.map((c) => ({ id: c.id, name: c.name, type: c.type }));
  const accountOptions = balances.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name, entityId: b.entityId }));
  const params = { tab, entity, month };

  return (
    <>
      <PageHeader title="Payments" description="Money received from customers, money paid to suppliers, and where it sits.">
        {editable ? (
          <>
            <PaymentDialog direction="in" contacts={contactOptions} accounts={accountOptions} date={today} defaultEntity={entity === "factory" ? "factory" : "brand"} />
            <PaymentDialog direction="out" contacts={contactOptions} accounts={accountOptions} date={today} defaultEntity={entity === "factory" ? "factory" : "brand"} />
          </>
        ) : null}
      </PageHeader>
      <StatGrid className="mb-5">
        <Stat label="Cash & bank" value={formatINR(cash)} hint="all active accounts" tone="primary" />
        <Stat label="Customers owe" value={formatINR(recvTotal)} hint={`${outstanding.receivables.length} customers`} />
        <Stat label="We owe" value={formatINR(payTotal)} hint={`${outstanding.payables.length} suppliers`} tone={payTotal > 0 ? "warning" : "default"} />
        <Stat label={`Net this month`} value={formatINR(inTotal - outTotal)} hint={`in ${formatINR(inTotal)} · out ${formatINR(outTotal)}`} />
      </StatGrid>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
          {[
            ["payments", "Payments"],
            ["accounts", "Cash & bank"],
            ["receivables", "Customers owe"],
            ["payables", "We owe"],
          ].map(([v, l]) => (
            <Link key={v} href={`/payments${qs({ ...params, tab: v })}`} className={cn("rounded-md px-3 py-1", tab === v ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {l}
            </Link>
          ))}
        </div>
        {tab === "payments" ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 text-sm">
              {[
                ["all", "All books"],
                ["brand", "Trupaths"],
                ["factory", "Factory"],
              ].map(([v, l]) => (
                <Link key={v} href={`/payments${qs({ ...params, entity: v })}`} className={cn("rounded-full px-3 py-1", entity === v ? "bg-foreground text-background" : "border bg-card text-muted-foreground")}>
                  {l}
                </Link>
              ))}
            </div>
            <MonthNav month={month} basePath="/payments" params={{ tab, entity }} />
          </div>
        ) : null}
      </div>

      {tab === "payments" ? (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>No.</TableHead>
                <TableHead>Who</TableHead>
                <TableHead className="hidden md:table-cell">Method</TableHead>
                <TableHead className="hidden lg:table-cell">Account</TableHead>
                <TableHead className="hidden sm:table-cell">Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {editable ? <TableHead className="w-16" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={8}>No payments this month.</TableEmpty>
              ) : (
                rows.map(({ p, contactName, accountName }) => (
                  <TableRow key={p.id} className={cn(p.voidedAt && "opacity-50")}>
                    <TableCell className="whitespace-nowrap">{formatDate(p.workDate, "d MMM")}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.number}</TableCell>
                    <TableCell>
                      <span className={cn(p.voidedAt && "line-through")}>{contactName ?? (p.direction === "in" ? "Receipt" : "Payment")}</span>
                      <span className="block text-xs text-muted-foreground">
                        {p.entityId === "factory" ? "Factory" : "Trupaths"}
                        {p.note ? ` · ${p.note}` : ""}
                        {p.voidedAt ? ` · voided: ${p.voidReason}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{PAYMENT_METHOD_LABEL[p.method] ?? p.method}</TableCell>
                    <TableCell className="hidden lg:table-cell">{accountName ?? "—"}</TableCell>
                    <TableCell className="hidden text-xs sm:table-cell">{p.reference || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Amount paise={p.amountP} tone={p.direction === "in" ? "in" : "out"} className="font-medium" />
                    </TableCell>
                    {editable ? (
                      <TableCell className="text-right">
                        {!p.voidedAt ? (
                          <ConfirmAction trigger={<Button variant="ghost" size="xs" className="text-muted-foreground" />} title={`Void ${p.number}?`} action={voidPayment} hidden={{ id: p.id }} confirmLabel="Void" destructive withReason>
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
      ) : null}

      {tab === "accounts" ? (
        <>
          {editable ? (
            <div className="mb-3">
              <BankAccountDialog />
            </div>
          ) : null}
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Books</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Opening</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  {editable ? <TableHead className="w-16" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.map((b) => (
                  <TableRow key={b.id} className={cn(!b.active && "opacity-60")}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell>{b.entityId === "factory" ? "Factory" : "Trupaths Ventures"}</TableCell>
                    <TableCell>{TYPE_LABEL[b.type] ?? b.type}</TableCell>
                    <TableCell className="tabular hidden text-right sm:table-cell">{formatINR(b.openingP)}</TableCell>
                    <TableCell className="text-right">
                      <Amount paise={b.balanceP} className="font-semibold" tone={b.balanceP < 0 ? "out" : "neutral"} />
                    </TableCell>
                    {editable ? (
                      <TableCell className="text-right">
                        <BankAccountDialog account={b} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
          <p className="mt-2 text-xs text-muted-foreground">Balance = opening + paid sales tagged to the account − paid expenses tagged to it + receipts − payments. Tag entries to an account to keep this accurate.</p>
        </>
      ) : null}

      {tab === "receivables" || tab === "payables" ? (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tab === "receivables" ? "Customer" : "Supplier / job worker"}</TableHead>
                <TableHead className="hidden sm:table-cell">Phone</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                {editable ? <TableHead className="w-36" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tab === "receivables" ? outstanding.receivables : outstanding.payables).length === 0 ? (
                <TableEmpty colSpan={4}>{tab === "receivables" ? "No customer owes anything. Credit sales with a customer selected show up here." : "Nothing outstanding. Credit bills with a supplier selected show up here."}</TableEmpty>
              ) : (
                (tab === "receivables" ? outstanding.receivables : outstanding.payables).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">{c.phone ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Amount paise={c.amount} tone={tab === "receivables" ? "in" : "out"} className="font-semibold" />
                    </TableCell>
                    {editable ? (
                      <TableCell className="text-right">
                        <PaymentDialog direction={tab === "receivables" ? "in" : "out"} contacts={contactOptions} accounts={accountOptions} date={today} defaultEntity="brand" defaultContactId={c.id} trigger={<Button variant="outline" size="xs" />} triggerLabel={tab === "receivables" ? "Record receipt" : "Record payment"} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableCard>
      ) : null}
    </>
  );
}
