import Link from "next/link";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { creditNotes, invoices, shipmentReturns } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ReturnForm } from "./return-form";
export default async function ReturnPage(props: PageProps<"/sales/invoices/[id]/return">) {
  await requireUser("sales");
  const {id}=await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [invoice]=await db.select().from(invoices).where(eq(invoices.id,id));
  if (!invoice) notFound();
  const previous=await db.select().from(creditNotes).where(eq(creditNotes.invoiceId,id));
  const [physicalReturn] = invoice.dispatchId ? await db.select().from(shipmentReturns).where(eq(shipmentReturns.dispatchId, invoice.dispatchId)) : [];
  return <div className="mx-auto max-w-4xl space-y-5"><Link href={`/print/invoice/${id}`} className="text-sm underline">Back to invoice</Link><h1 className="text-xl font-semibold">Return against {invoice.number}</h1>{invoice.voidedAt ? <p>This invoice was cancelled.</p> : invoice.shopifyOrderId ? <p>Website returns need the Shopify refund and credit note reconciled in your current accounting system. Automatic credit notes for these orders are not connected yet.</p> : physicalReturn && physicalReturn.stage !== "inspected" ? <p>Complete receipt and inspection on the dispatch page before reviewing this credit note.</p> : <ReturnForm invoice={invoice} previous={previous} requestId={randomUUID()} physicalLines={physicalReturn?.lines} />}</div>;
}
