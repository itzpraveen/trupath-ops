import { requireUser } from "@/lib/auth";
import { todayIST } from "@/lib/dates";
import { getBrands, getCategories, getContacts, getEntities, getProductOptions } from "@/lib/queries/common";
import { PageHeader } from "@/components/app/page-header";
import { DispatchForm } from "../../dispatch/dispatch-form";
export const metadata = { title: "New sale" };
export default async function NewSalePage() {
  await requireUser("sales");
  const [products, brands, channels, customers, entities] = await Promise.all([getProductOptions(), getBrands(), getCategories("channel"), getContacts("customer"), getEntities()]);
  return <><PageHeader title="New sale" description="Choose a saved customer and enter the agreed prices including GST. Save the sale, review its tax invoice, then issue and print it. Stock leaves only when the parcel is marked shipped." backHref="/sales" backLabel="Sales" />
    <DispatchForm salesMode products={products} brands={brands} entities={entities} channels={channels.map((c) => c.name)} customers={customers} date={todayIST()} /></>;
}
