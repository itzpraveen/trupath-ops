import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices, creditNotes } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { canView, canEdit } from "@/lib/permissions";
import { InvoiceDocument } from "@/components/app/invoice-document";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Button } from "@/components/ui/button";
import { voidInvoice } from "@/actions/invoices";
import { PrintButton } from "../../print-button";
export default async function InvoicePrintPage(props: PageProps<"/print/invoice/[id]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canView(user.role, "dispatch") && !canView(user.role, "sales")) redirect("/?denied=sales");
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!inv) notFound();
  const credits = await db.select().from(creditNotes).where(eq(creditNotes.invoiceId, id));
  return <><div className="no-print mb-3 flex items-center justify-between gap-3 text-sm"><Link href={inv.dispatchId ? `/dispatch/${inv.dispatchId}` : `/orders/${inv.shopifyOrderId}`}>Back to sale</Link><Link href="/sales/invoices">Invoice register</Link>
    {!inv.voidedAt && canEdit(user.role, "sales") ? <ConfirmAction action={voidInvoice} hidden={{ id }} title={`Cancel invoice ${inv.number}?`} description="Only unshipped invoices can be cancelled here. The sale stays open for correction and reissue; this number will never be reused. Shipped sales need a credit note from accounts." confirmLabel="Cancel invoice" withReason destructive trigger={<Button variant="outline" size="sm" />}>Cancel invoice</ConfirmAction> : null}
    {!inv.voidedAt && canEdit(user.role, "sales") ? <Link href={`/sales/invoices/${id}/return`}>Record return / credit note</Link> : null}
    </div>{credits.length ? <div className="no-print mb-3 text-sm">Credit notes: {credits.map(c=><Link key={c.id} href={`/print/credit-note/${c.id}`} className="mr-3 underline">{c.number}</Link>)}</div> : null}<PrintButton /><InvoiceDocument inv={inv} /></>;
}
