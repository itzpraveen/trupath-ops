import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, isNull, like } from "drizzle-orm";
import { Pencil, Printer } from "lucide-react";
import { db } from "@/db";
import { businessRecords, contacts, jobWorkMaterials, jobWorkOrders, jobWorkReceipts, materials, products, uploads } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDate, todayIST } from "@/lib/dates";
import { formatINR, formatQty } from "@/lib/money";
import { canEdit } from "@/lib/permissions";
import { getCategories, getContacts, getMaterials, getProductOptions } from "@/lib/queries/common";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader, Section } from "@/components/app/page-header";
import { Stat, StatGrid } from "@/components/app/stat";
import { JOBWORK_TONE, StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCard, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/app/data-table";
import { PhotoUploader } from "@/components/app/photo-uploader";
import { JobWorkActions } from "../jobwork-actions";
import { JobWorkForm } from "../jobwork-form";

export const metadata: Metadata = { title: "Job work order" };

export default async function JobWorkDetailPage(props: PageProps<"/jobwork/[id]">) {
  const user = await requireUser("jobwork");
  const { id } = await props.params;
  const sp = await props.searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [row] = await db
    .select({ o: jobWorkOrders, vendor: contacts, productName: products.name, productVariant: products.variant })
    .from(jobWorkOrders)
    .innerJoin(contacts, eq(contacts.id, jobWorkOrders.vendorId))
    .leftJoin(products, eq(products.id, jobWorkOrders.productId))
    .where(eq(jobWorkOrders.id, id))
    .limit(1);
  if (!row) notFound();
  const { o, vendor } = row;
  const editable = canEdit(user.role, "jobwork");
  const [mats, receipts, bills, files] = await Promise.all([
    db.select({ m: jobWorkMaterials, name: materials.name, unit: materials.unit }).from(jobWorkMaterials).innerJoin(materials, eq(materials.id, jobWorkMaterials.materialId)).where(eq(jobWorkMaterials.orderId, id)).orderBy(asc(materials.code)),
    db.select().from(jobWorkReceipts).where(eq(jobWorkReceipts.orderId, id)).orderBy(desc(jobWorkReceipts.receiptDate), desc(jobWorkReceipts.createdAt)),
    // one bill per batch of accepted pieces: source refs are jobwork:<id> then jobwork:<id>:<pieces billed before>
    db.select().from(businessRecords).where(and(like(businessRecords.sourceRef, `jobwork:${id}%`), isNull(businessRecords.voidedAt))).orderBy(asc(businessRecords.workDate), asc(businessRecords.createdAt)),
    db.select({ id: uploads.id, fileName: uploads.fileName, size: uploads.size, createdAt: uploads.createdAt }).from(uploads).where(and(eq(uploads.kind, "jobwork_file"), eq(uploads.refId, id))).orderBy(desc(uploads.createdAt)),
  ]);

  if (editable && sp.edit === "1" && o.status !== "closed" && o.status !== "cancelled") {
    const [contactsList, processes, productOptions, materialList] = await Promise.all([getContacts(), getCategories("process"), getProductOptions(), getMaterials()]);
    return (
      <>
        <PageHeader title={`Edit ${o.number}`} backHref={`/jobwork/${id}`} backLabel="Back to order" />
        <JobWorkForm vendors={contactsList.filter((c) => c.type !== "customer").map((c) => ({ id: c.id, name: c.name }))} processes={processes.map((p) => p.name)} products={productOptions} materials={materialList} date={todayIST()} initial={o} />
      </>
    );
  }

  const pending = Math.max(0, o.orderedQty - o.receivedQty - o.rejectedQty);
  const unbilled = Math.max(0, o.receivedQty - o.billedQty);
  const estimate = Math.round(unbilled * o.ratePerUnitP * (1 + o.taxBps / 10000));
  const billedTotal = bills.reduce((s, b) => s + b.amountP, 0);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {o.number} <StatusBadge tone={JOBWORK_TONE[o.status]}>{o.status === "sent" ? "with job worker" : o.status}</StatusBadge>
          </span>
        }
        description={`${vendor.name} · ${o.process}${row.productName ? ` · ${row.productName}${row.productVariant ? ` — ${row.productVariant}` : ""}` : ""} · ordered ${formatDate(o.workDate)}${o.dueDate ? `, due ${formatDate(o.dueDate)}` : ""}`}
        backHref="/jobwork"
        backLabel="Job work"
      >
        <Link href={`/print/jobwork/${o.id}`} target="_blank" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Printer /> Print challan
        </Link>
        {editable && o.status !== "closed" && o.status !== "cancelled" ? (
          <Link href={`/jobwork/${o.id}?edit=1`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Pencil /> Edit
          </Link>
        ) : null}
      </PageHeader>
      {editable ? (
        <div className="mb-6">
          <JobWorkActions order={o} sentMaterials={mats.map((m) => ({ materialId: m.m.materialId, name: m.name, unit: m.unit, qtySent: m.m.qtySent, qtyReturned: m.m.qtyReturned }))} date={todayIST()} />
        </div>
      ) : null}
      <StatGrid className="mb-6">
        <Stat label="Ordered" value={o.orderedQty} />
        <Stat label="Received" value={o.receivedQty} hint={o.rejectedQty ? `${o.rejectedQty} rejected` : undefined} tone="primary" />
        <Stat label="Pending" value={pending} tone={pending ? "warning" : "default"} />
        <Stat label={bills.length ? "Billed" : "Estimated bill"} value={bills.length ? formatINR(billedTotal) : estimate ? formatINR(estimate) : "—"} hint={`${o.billedQty ? `${o.billedQty} of ${o.receivedQty} pcs billed · ` : ""}${o.ratePerUnitP ? `${formatINR(o.ratePerUnitP)} per piece${o.taxBps ? ` + ${o.taxBps / 100}% GST` : ""}` : "no rate set"}`} />
      </StatGrid>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Materials sent">
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Returned</TableHead>
                  <TableHead className="text-right">With worker</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mats.length === 0 ? (
                  <TableEmpty colSpan={4}>No materials listed on this order.</TableEmpty>
                ) : (
                  mats.map(({ m, name, unit }) => (
                    <TableRow key={m.id}>
                      <TableCell>{name}</TableCell>
                      <TableCell className="tabular text-right">{formatQty(m.qtySent, unit)}</TableCell>
                      <TableCell className="tabular text-right">{m.qtyReturned ? formatQty(m.qtyReturned) : "—"}</TableCell>
                      <TableCell className="tabular text-right font-medium">{formatQty(Math.max(0, m.qtySent - m.qtyReturned))}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableCard>
          {o.status === "draft" ? <p className="mt-2 text-xs text-muted-foreground">Draft: materials have not left the store yet.</p> : null}
        </Section>
        <Section title="Receipts">
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead className="text-right">Rejected</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.length === 0 ? (
                  <TableEmpty colSpan={4}>Nothing received yet.</TableEmpty>
                ) : (
                  receipts.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatDate(r.receiptDate, "d MMM")}</TableCell>
                      <TableCell className="tabular text-right font-medium">{r.acceptedQty}</TableCell>
                      <TableCell className="tabular text-right">{r.rejectedQty || "—"}</TableCell>
                      <TableCell className="max-w-48 truncate text-muted-foreground">{r.note ?? ""}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableCard>
          {bills.length ? (
            <div className="mt-2 space-y-1 text-sm">
              {bills.map((b) => (
                <p key={b.id}>
                  Bill {b.number} for {formatINR(b.amountP)} recorded on {formatDate(b.workDate)} ({b.paymentTerms === "credit" ? "unpaid" : "paid"}).
                </p>
              ))}
              {unbilled ? <p className="text-muted-foreground">{unbilled} accepted pieces not billed yet.</p> : null}
              <Link href="/payments?tab=payables" className="text-primary hover:underline">
                See payables
              </Link>
            </div>
          ) : null}
        </Section>
      </div>
      <div className="mt-6">
        <Section title="Files" description="Challans, photos of the pieces, the job worker's bill.">
          <PhotoUploader kind="jobwork_file" refId={o.id} photos={files.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }))} editable={editable && o.status !== "cancelled"} />
        </Section>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title="Job worker">
          <div className="rounded-xl border bg-card p-4 text-sm">
            <p className="font-medium">{vendor.name}</p>
            {vendor.phone ? <p>{vendor.phone}</p> : null}
            {vendor.gstin ? <p>GSTIN {vendor.gstin}</p> : null}
            {vendor.address ? <p className="mt-1 whitespace-pre-line text-muted-foreground">{vendor.address}</p> : null}
          </div>
        </Section>
        {o.description || o.note ? (
          <Section title="Instructions">
            <div className="rounded-xl border bg-card p-4 text-sm">
              {o.description ? <p>{o.description}</p> : null}
              {o.note ? <p className="mt-1 whitespace-pre-line text-muted-foreground">{o.note}</p> : null}
            </div>
          </Section>
        ) : null}
      </div>
    </>
  );
}
