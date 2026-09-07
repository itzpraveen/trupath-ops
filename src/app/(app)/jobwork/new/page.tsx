import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { todayIST } from "@/lib/dates";
import { getCategories, getContacts, getMaterials, getProductOptions } from "@/lib/queries/common";
import { PageHeader } from "@/components/app/page-header";
import { JobWorkForm } from "../jobwork-form";

export const metadata: Metadata = { title: "New job work" };

export default async function NewJobWorkPage() {
  await requireUser("jobwork");
  const [contactsList, processes, products, materials] = await Promise.all([getContacts(), getCategories("process"), getProductOptions(), getMaterials()]);
  const vendors = contactsList.filter((c) => c.type !== "customer").map((c) => ({ id: c.id, name: c.name }));
  return (
    <>
      <PageHeader title="New job work" description="A challan for work sent outside. List the materials that go with it so the store balance stays right." backHref="/jobwork" backLabel="Job work" />
      <JobWorkForm vendors={vendors} processes={processes.map((p) => p.name)} products={products} materials={materials} date={todayIST()} />
    </>
  );
}
