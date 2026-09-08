import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { cn } from "cn";
import { toggleCategory } from "@/actions/settings";
import { db } from "@/db";
import { brands, categories, type CategoryKind } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { InlineAction } from "@/components/app/inline-action";
import { Section } from "@/components/app/page-header";
import { AddCategoryDialog, BrandDialog } from "./list-dialogs";

export const metadata: Metadata = { title: "Lists & brands" };
const KINDS: { kind: CategoryKind; label: string; help: string }[] = [
  { kind: "expense", label: "Expense categories", help: "Used when adding expenses and purchases." },
  { kind: "channel", label: "Sales channels", help: "Where a sale came from." },
  { kind: "process", label: "Job work processes", help: "Stitching, cutting, embroidery and so on." },
  { kind: "designation", label: "Staff roles", help: "Shown on the staff page." },
];

export default async function ListsPage() {
  await requireUser("settings");
  const [cats, brandRows] = await Promise.all([db.select().from(categories).orderBy(asc(categories.kind), asc(categories.sortOrder), asc(categories.name)), db.select().from(brands).orderBy(asc(brands.sortOrder), asc(brands.name))]);
  return (
    <div className="space-y-8">
      <Section title="Brands" description="Stock and production are tracked per brand." actions={<BrandDialog />}>
        <ul className="divide-y rounded-xl border bg-card text-sm">
          {brandRows.map((b) => (
            <li key={b.id} className={cn("flex items-center justify-between px-4 py-2", !b.active && "opacity-60")}>
              <span>
                {b.name} <span className="text-xs text-muted-foreground">{b.id}</span>
                {!b.active ? <span className="ml-2 text-xs text-muted-foreground">inactive</span> : null}
              </span>
              <BrandDialog brand={b} />
            </li>
          ))}
        </ul>
      </Section>
      <div className="grid gap-6 lg:grid-cols-2">
        {KINDS.map(({ kind, label, help }) => (
          <Section key={kind} title={label} description={help} actions={<AddCategoryDialog kind={kind} label={label.replace(/s$/, "")} />}>
            <ul className="divide-y rounded-xl border bg-card text-sm">
              {cats
                .filter((c) => c.kind === kind)
                .map((c) => (
                  <li key={c.id} className={cn("flex items-center justify-between px-4 py-1.5", !c.active && "opacity-60")}>
                    <span>{c.name}</span>
                    <InlineAction action={toggleCategory} hidden={{ id: c.id }} className="text-muted-foreground">
                      {c.active ? "Hide" : "Show"}
                    </InlineAction>
                  </li>
                ))}
            </ul>
          </Section>
        ))}
      </div>
    </div>
  );
}
