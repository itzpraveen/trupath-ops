import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { todayIST } from "@/lib/dates";
import { getBrands, getCategories, getContacts, getEntities, getProductOptions } from "@/lib/queries/common";
import { PageHeader } from "@/components/app/page-header";
import { DispatchForm } from "../dispatch-form";

export const metadata: Metadata = { title: "New dispatch" };

export default async function NewDispatchPage() {
  await requireUser("dispatch");
  const [products, brands, channels, customers, entities] = await Promise.all([getProductOptions(), getBrands(), getCategories("channel"), getContacts("customer"), getEntities()]);
  return (
    <>
      <PageHeader title="New dispatch" description="For website orders, open the order and use “Create dispatch” instead so the items are filled in for you." backHref="/dispatch" backLabel="Dispatch" />
      <DispatchForm products={products} brands={brands} entities={entities.map((e) => ({ id: e.id, name: e.name }))} channels={channels.map((c) => c.name)} customers={customers.map((c) => ({ id: c.id, name: c.name }))} date={todayIST()} />
    </>
  );
}
