import Link from "next/link";
import { and, desc, eq, gte, ilike, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { entities, invoices, shopifyOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDate, monthKey, monthRange } from "@/lib/dates";
import { getEntities } from "@/lib/queries/common";
import { int, pick, qs, str } from "@/lib/url";
import { Amount } from "@/components/app/amount";
import { MonthNav } from "@/components/app/month-nav";
import { PageHeader } from "@/components/app/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCard, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/app/data-table";
export const metadata = { title: "Tax invoices" };
export default async function InvoicesPage(props: PageProps<"/sales/invoices">) {
  await requireUser("sales");
  const sp = await props.searchParams;
  const books = await getEntities();
  const entity = pick(sp.entity, ["all", ...books.map((e) => e.id)], "all");
  const status = pick(sp.status, ["all", "issued", "cancelled"], "all");
  const month = /^\d{4}-\d{2}$/.test(String(sp.month ?? "")) ? String(sp.month) : monthKey();
  const [from, to] = monthRange(month);
  const q = str(sp.q, 100), page = int(sp.page), params = { entity, status, month, q };
  const rows = await db.select({ inv: invoices, books: entities.name, changedOrder: sql<boolean>`coalesce(${shopifyOrders.refundedP} > 0 or ${shopifyOrders.cancelledAt} is not null, false)` }).from(invoices)
    .innerJoin(entities, eq(entities.id, invoices.entityId)).leftJoin(shopifyOrders, eq(shopifyOrders.id, invoices.shopifyOrderId))
    .where(and(gte(invoices.issuedOn, from), lte(invoices.issuedOn, to), entity === "all" ? undefined : eq(invoices.entityId, entity), status === "issued" ? isNull(invoices.voidedAt) : status === "cancelled" ? isNotNull(invoices.voidedAt) : undefined, q ? or(ilike(invoices.number, `%${q}%`), ilike(invoices.customerName, `%${q}%`)) : undefined))
    .orderBy(desc(invoices.createdAt), desc(invoices.id)).limit(51).offset((page - 1) * 50);
  return <><PageHeader title="Tax invoices" description="Issued and cancelled documents. Cancelled numbers stay in the register and are never reused." backHref="/sales" backLabel="Sales"><Link href="/sales/new" className={buttonVariants({ size: "sm" })}>New sale</Link><Link href="/sales/credit-notes" className={buttonVariants({variant:"outline",size:"sm"})}>Credit notes</Link></PageHeader>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><form className="flex flex-wrap gap-2"><input type="hidden" name="month" value={month} /><NativeSelect name="entity" aria-label="Books" defaultValue={entity}><option value="all">All books</option>{books.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</NativeSelect><NativeSelect name="status" aria-label="Status" defaultValue={status}><option value="all">All invoices</option><option value="issued">Issued</option><option value="cancelled">Cancelled</option></NativeSelect><Input name="q" aria-label="Invoice or buyer" placeholder="Invoice number or buyer" defaultValue={q} /><Button type="submit" variant="outline">Search</Button></form><MonthNav month={month} basePath="/sales/invoices" params={{ entity, status, q }} /></div>
    <TableCard><Table><TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Buyer / books</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader><TableBody>
      {!rows.length ? <TableEmpty colSpan={5}>No invoices this month.</TableEmpty> : rows.slice(0, 50).map(({ inv, books, changedOrder }) => <TableRow key={inv.id}><TableCell><Link href={`/print/invoice/${inv.id}`} className="text-primary underline">{inv.number}</Link></TableCell><TableCell>{formatDate(inv.issuedOn)}</TableCell><TableCell>{inv.customerName}<span className="block text-xs text-muted-foreground">{books}</span></TableCell><TableCell>{inv.voidedAt ? `Cancelled: ${inv.voidReason}` : changedOrder ? "Accounts review: order cancelled / refunded" : "Issued"}</TableCell><TableCell className="text-right"><Amount paise={inv.totalP} /></TableCell></TableRow>)}
    </TableBody></Table></TableCard>
    <div className="mt-4 flex justify-between text-sm">{page > 1 ? <Link href={`/sales/invoices${qs({ ...params, page: page - 1 })}`}>Previous</Link> : <span />}{rows.length > 50 ? <Link href={`/sales/invoices${qs({ ...params, page: page + 1 })}`}>Next</Link> : null}</div>
    <p className="mt-3 text-xs text-muted-foreground">Shipped returns and Shopify refunds require credit-note review by accounts. Open an invoice to record a manual goods return. Website credit-note reconciliation and e-invoice IRPs are not connected yet.</p>
  </>;
}
