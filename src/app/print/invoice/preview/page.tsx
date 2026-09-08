import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { previewInvoice, invoiceFingerprint } from "@/lib/invoice-issue";
import { createInvoice } from "@/actions/invoices";
import { InvoiceDocument } from "@/components/app/invoice-document";
import { IssueInvoiceForm } from "./issue-form";
export default async function PreviewPage(props: PageProps<"/print/invoice/preview">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEdit(user.role, "dispatch") && !canEdit(user.role, "sales")) redirect("/?denied=sales");
  const sp = await props.searchParams;
  if ((sp.source !== "order" && sp.source !== "dispatch") || typeof sp.id !== "string" || (sp.source === "dispatch" ? !/^[0-9a-f-]{36}$/i.test(sp.id) : !/^\d+$/.test(sp.id))) notFound();
  const input: { source: "order" | "dispatch"; id: string } = { source: sp.source, id: sp.id };
  const back = sp.source === "dispatch" ? `/dispatch/${sp.id}` : `/orders/${sp.id}`;
  let draft;
  try { draft = await previewInvoice(input); } catch (e) {
    return <div className="space-y-4 text-sm"><h1 className="text-lg font-semibold">Invoice needs attention</h1><p>{e instanceof Error ? e.message : "Unable to prepare invoice"}</p><Link href={back}>Back to sale</Link> · <Link href="/settings">Company details</Link> · <Link href="/products">Products</Link> · <Link href="/contacts">Customers</Link></div>;
  }
  return <><div className="no-print mb-5 space-y-3"><Link href={back} className="text-sm underline">Back to sale</Link><p className="text-sm">Review the buyer, items, GST and total. Issuing fixes these details and allocates the next invoice number.</p><IssueInvoiceForm action={createInvoice} source={input.source} id={input.id} fingerprint={invoiceFingerprint(draft)} /></div><InvoiceDocument draft inv={{ ...draft, number: "DRAFT", voidedAt: null, voidReason: null }} /></>;
}
