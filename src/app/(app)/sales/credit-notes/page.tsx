import Link from "next/link";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { creditNotes, invoices } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDate, monthKey, monthRange } from "@/lib/dates";
import { int } from "@/lib/url";
import { formatINR } from "@/lib/money";
import { MonthNav } from "@/components/app/month-nav";
import { PageHeader } from "@/components/app/page-header";
import { Table,TableBody,TableCard,TableCell,TableEmpty,TableHead,TableHeader,TableRow } from "@/components/app/data-table";
export const metadata={title:"Credit notes"};
export default async function CreditNotesPage(props:PageProps<"/sales/credit-notes">) {
  await requireUser("sales"); const sp=await props.searchParams;
  const month=/^\d{4}-\d{2}$/.test(String(sp.month??"")) ? String(sp.month) : monthKey(); const [from,to]=monthRange(month),page=int(sp.page);
  const rows=await db.select({note:creditNotes,invoice:invoices}).from(creditNotes).innerJoin(invoices,eq(invoices.id,creditNotes.invoiceId)).where(and(gte(creditNotes.issuedOn,from),lte(creditNotes.issuedOn,to))).orderBy(desc(creditNotes.createdAt),desc(creditNotes.id)).limit(51).offset((page-1)*50);
  return <><PageHeader title="Credit notes" description="Returns linked to original invoices. Actual refunds are recorded separately in Payments." backHref="/sales/invoices" backLabel="Invoices"/><MonthNav month={month} basePath="/sales/credit-notes"/><TableCard><Table><TableHeader><TableRow><TableHead>Credit note</TableHead><TableHead>Date</TableHead><TableHead>Customer / original invoice</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Credit</TableHead></TableRow></TableHeader><TableBody>{rows.length ? rows.slice(0,50).map(({note,invoice})=><TableRow key={note.id}><TableCell><Link href={`/print/credit-note/${note.id}`} className="underline">{note.number}</Link></TableCell><TableCell>{formatDate(note.issuedOn)}</TableCell><TableCell>{invoice.customerName}<Link href={`/print/invoice/${invoice.id}`} className="block text-sm underline">{invoice.number}</Link></TableCell><TableCell>{note.reason}</TableCell><TableCell className="text-right">{formatINR(note.totalP)}</TableCell></TableRow>) : <TableEmpty colSpan={5}>No credit notes this month.</TableEmpty>}</TableBody></Table></TableCard><div className="mt-4 flex justify-between">{page>1 ? <Link href={`?month=${month}&page=${page-1}`}>Previous</Link>:<span/>}{rows.length>50 ? <Link href={`?month=${month}&page=${page+1}`}>Next</Link>:null}</div></>;
}
