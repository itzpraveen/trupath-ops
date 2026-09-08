import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getEntities } from "@/lib/queries/common";
import { Section } from "@/components/app/page-header";
import { EntityForm } from "./entity-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireUser("settings");
  const entities = await getEntities();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {entities.map((e) => (
        <Section key={e.id} title={e.id === "brand" ? "Trupaths Ventures (brand books)" : "Factory books"} description={e.id === "brand" ? "Used on dispatch challans for website and wholesale orders." : "Used on job work challans. Fill in separately if the factory has its own GST registration."}>
          <EntityForm entity={e} />
        </Section>
      ))}
    </div>
  );
}
