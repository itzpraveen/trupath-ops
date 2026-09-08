import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { creditNotes, invoices } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { InvoiceDocument } from "@/components/app/invoice-document";
import { PrintButton } from "../../print-button";
export default async function CreditNotePage(props: PageProps<"/print/credit-note/[id]">) {
  await requireUser("sales");
  const {id}=await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [row]=await db.select({note:creditNotes,invoice:invoices}).from(creditNotes).innerJoin(invoices,eq(invoices.id,creditNotes.invoiceId)).where(eq(creditNotes.id,id));
  if (!row) notFound();
  const {note,invoice}=row;
  return <><div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3 text-sm"><Link href={`/print/invoice/${invoice.id}`}>Original invoice {invoice.number}</Link><Link href="/payments">Record actual refund in Payments</Link><Link href="/sales/invoices">Invoice register</Link></div><PrintButton/><InvoiceDocument creditNote={{originalNumber:invoice.number,originalDate:invoice.issuedOn,reason:note.reason}} inv={{...invoice,...note,voidedAt:null,voidReason:null}}/></>;
}
