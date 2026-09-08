import type { Metadata } from "next";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { todayIST } from "@/lib/dates";
import { peekInvoiceNumber } from "@/lib/numbering";
import { getEntities } from "@/lib/queries/common";
import { Section } from "@/components/app/page-header";
import { EntityForm } from "./entity-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireUser("settings");
  const entities = await getEntities();
  const today = todayIST();
  const nextNumbers = await Promise.all(entities.map((e) => peekInvoiceNumber(db, e.id, e.invoicePrefix, today)));
  const nextB2BNumbers = await Promise.all(entities.map((e) => peekInvoiceNumber(db, e.id, "B2B", today)));
  const nextCreditNumbers = await Promise.all(entities.map((e) => peekInvoiceNumber(db, e.id, "CN", today)));
  const DESCRIPTION: Record<string, string> = {
    brand: "Printed on tax invoices and dispatch challans for website and wholesale orders.",
    factory: "Used on job work challans. Fill in separately if the factory has its own GST registration.",
    firstbon: "Printed on Firstbon tax invoices and challans. Enter its own GSTIN if it is registered separately.",
  };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {entities.map((e, i) => (
        <Section key={e.id} title={`${e.name} books`} description={DESCRIPTION[e.id] ?? "Printed on invoices and challans for these books."}>
          <EntityForm entity={e} nextInvoiceNo={nextNumbers[i]} nextB2BInvoiceNo={nextB2BNumbers[i]} nextCreditNoteNo={nextCreditNumbers[i]} />
        </Section>
      ))}
    </div>
  );
}
