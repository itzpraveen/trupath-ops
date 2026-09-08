import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, ilike, or } from "drizzle-orm";
import { cn } from "cn";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canEdit, canView } from "@/lib/permissions";
import { outstandingByContact } from "@/lib/queries/money";
import { pick, qs, str } from "@/lib/url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Amount } from "@/components/app/amount";
import { PageHeader } from "@/components/app/page-header";
import { Table, TableBody, TableCard, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/app/data-table";
import { ContactDialog } from "./contact-dialog";

export const metadata: Metadata = { title: "Customers & vendors" };
const TYPE_LABEL: Record<string, string> = { customer: "Customer", vendor: "Supplier", job_worker: "Job worker" };

export default async function ContactsPage(props: PageProps<"/contacts">) {
  const user = await requireUser("contacts");
  const sp = await props.searchParams;
  const type = pick(sp.type, ["all", "customer", "vendor", "job_worker"], "all");
  const q = str(sp.q, 80);
  const showAll = sp.all === "1";
  const [rows, outstanding] = await Promise.all([
    db
      .select()
      .from(contacts)
      .where(and(showAll ? undefined : eq(contacts.active, true), type === "all" ? undefined : eq(contacts.type, type), q ? or(ilike(contacts.name, `%${q}%`), ilike(contacts.phone, `%${q}%`), ilike(contacts.email, `%${q}%`), ilike(contacts.gstin, `%${q}%`)) : undefined))
      .orderBy(asc(contacts.name)),
    canView(user.role, "payments") ? outstandingByContact() : Promise.resolve(new Map()),
  ]);
  const showBalances = canView(user.role, "payments");
  const editable = canEdit(user.role, "contacts");
  const params = { type, q: q || undefined, all: showAll ? "1" : undefined };

  return (
    <>
      <PageHeader title="Customers & vendors" description="Wholesale customers, suppliers and job workers. Website customers stay in Shopify.">
        {editable ? <ContactDialog defaultType={type === "all" ? "customer" : type} /> : null}
      </PageHeader>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
          {[
            ["all", "All"],
            ["customer", "Customers"],
            ["vendor", "Suppliers"],
            ["job_worker", "Job workers"],
          ].map(([v, l]) => (
            <Link key={v} href={`/contacts${qs({ ...params, type: v })}`} className={cn("rounded-md px-3 py-1", type === v ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {l}
            </Link>
          ))}
        </div>
        <form className="flex items-center gap-2" action="/contacts">
          <input type="hidden" name="type" value={type} />
          <Input name="q" defaultValue={q} placeholder="Name, phone, GSTIN…" className="w-52" />
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
          <Link href={`/contacts${qs({ ...params, all: showAll ? undefined : "1" })}`} className="text-xs text-muted-foreground hover:text-foreground">
            {showAll ? "Hide inactive" : "Show inactive"}
          </Link>
        </form>
      </div>
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="hidden sm:table-cell">Phone</TableHead>
              <TableHead className="hidden md:table-cell">GSTIN</TableHead>
              <TableHead className="hidden lg:table-cell">Address</TableHead>
              {showBalances ? <><TableHead className="text-right">They owe</TableHead><TableHead className="text-right">We owe</TableHead></> : null}
              {editable ? <TableHead className="w-16" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={8}>No contacts yet. Add wholesale customers, fabric suppliers and stitching units.</TableEmpty>
            ) : (
              rows.map((c) => {
                const o = [...outstanding.values()].filter((b) => b.contactId === c.id).reduce((sum, b) => ({ receivable: sum.receivable + Math.max(0, b.receivable), payable: sum.payable + Math.max(0, b.payable) }), { receivable: 0, payable: 0 });
                return (
                  <TableRow key={c.id} className={cn(!c.active && "opacity-60")}>
                    <TableCell className="font-medium">
                      {c.name}
                      {c.email ? <span className="block text-xs font-normal text-muted-foreground">{c.email}</span> : null}
                    </TableCell>
                    <TableCell>{TYPE_LABEL[c.type] ?? c.type}</TableCell>
                    <TableCell className="hidden sm:table-cell">{c.phone ?? "—"}</TableCell>
                    <TableCell className="hidden text-xs md:table-cell">{c.gstin ?? "—"}</TableCell>
                    <TableCell className="hidden max-w-56 truncate text-xs text-muted-foreground lg:table-cell">{c.address ?? ""}</TableCell>
                    {showBalances ? <><TableCell className="text-right">{o && o.receivable > 0 ? <Amount paise={o.receivable} tone="in" /> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right">{o && o.payable > 0 ? <Amount paise={o.payable} tone="out" /> : <span className="text-muted-foreground">—</span>}</TableCell></> : null}
                    {editable ? (
                      <TableCell className="text-right">
                        <ContactDialog contact={c} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableCard>
    </>
  );
}
