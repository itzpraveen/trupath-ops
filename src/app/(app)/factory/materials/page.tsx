import type { Metadata } from "next";
import Link from "next/link";
import { asc, ilike, or, eq, and } from "drizzle-orm";
import { Download } from "lucide-react";
import { cn } from "cn";
import { db } from "@/db";
import { materials } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDate, todayIST } from "@/lib/dates";
import { formatINR, formatQty } from "@/lib/money";
import { canEdit } from "@/lib/permissions";
import { getContacts } from "@/lib/queries/common";
import { str } from "@/lib/url";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/app/page-header";
import { Stat, StatGrid } from "@/components/app/stat";
import { StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCard, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/app/data-table";
import { MaterialDialog, MaterialMovementDialog } from "./material-dialogs";

export const metadata: Metadata = { title: "Raw materials" };

export default async function MaterialsPage(props: PageProps<"/factory/materials">) {
  const user = await requireUser("materials");
  const sp = await props.searchParams;
  const q = str(sp.q, 80);
  const showInactive = sp.all === "1";
  const rows = await db
    .select()
    .from(materials)
    .where(and(showInactive ? undefined : eq(materials.active, true), q ? or(ilike(materials.name, `%${q}%`), ilike(materials.code, `%${q}%`)) : undefined))
    .orderBy(asc(materials.code));
  const vendors = (await getContacts()).filter((c) => c.type !== "customer").map((c) => ({ id: c.id, name: c.name }));
  const editable = canEdit(user.role, "materials");
  const low = rows.filter((m) => m.active && m.minQty > 0 && m.qty <= m.minQty);
  const value = rows.reduce((s, m) => s + Math.round(m.qty * m.costP), 0);
  const nextCode = `RM-${String(rows.reduce((max, m) => Math.max(max, Number(m.code.replace(/\D/g, "")) || 0), 0) + 1).padStart(3, "0")}`;
  const today = todayIST();

  return (
    <>
      <PageHeader title="Raw materials" description="Fabric, prints, foam, zips and everything else the factory uses." backHref="/factory" backLabel="Daily register">
        {editable ? <MaterialDialog nextCode={nextCode} /> : null}
        <Link href="/factory/boms" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Material recipes
        </Link>
        <Link href="/api/export/materials" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Download /> Export CSV
        </Link>
      </PageHeader>
      <StatGrid className="mb-5">
        <Stat label="Materials" value={rows.filter((m) => m.active).length} />
        <Stat label="Running low" value={low.length} tone={low.length ? "warning" : "default"} hint="at or below minimum" />
        <Stat label="Stock value" value={formatINR(value)} hint="quantity × cost per unit" />
        <Stat label="Counted this month" value={rows.filter((m) => m.lastCountAt && m.lastCountAt.toISOString().slice(0, 7) === today.slice(0, 7)).length} hint={`of ${rows.length}`} />
      </StatGrid>
      <form className="mb-3 flex items-center gap-2" action="/factory/materials">
        {showInactive ? <input type="hidden" name="all" value="1" /> : null}
        <Input name="q" defaultValue={q} placeholder="Search materials…" className="w-56" />
        <Button type="submit" variant="outline" size="sm">
          Search
        </Button>
        <Link href={showInactive ? "/factory/materials" : "/factory/materials?all=1"} className="text-xs text-muted-foreground hover:text-foreground">
          {showInactive ? "Hide unused" : "Show unused"}
        </Link>
      </form>
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Material</TableHead>
              <TableHead className="text-right">In stock</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Minimum</TableHead>
              <TableHead className="hidden text-right md:table-cell">Cost / unit</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Last count</TableHead>
              <TableHead>Status</TableHead>
              {editable ? <TableHead className="w-56" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={8}>No materials match.</TableEmpty>
            ) : (
              rows.map((m) => {
                const isLow = m.minQty > 0 && m.qty <= m.minQty;
                return (
                  <TableRow key={m.id} className={cn(!m.active && "opacity-60")}>
                    <TableCell className="text-xs text-muted-foreground">{m.code}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/factory/materials/${m.id}`} className="hover:underline">
                        {m.name}
                      </Link>
                    </TableCell>
                    <TableCell className={cn("tabular text-right font-semibold", isLow && "text-warning")}>{formatQty(m.qty, m.unit)}</TableCell>
                    <TableCell className="tabular hidden text-right text-muted-foreground sm:table-cell">{m.minQty ? formatQty(m.minQty) : "—"}</TableCell>
                    <TableCell className="tabular hidden text-right md:table-cell">{m.costP ? formatINR(m.costP, { exact: true }) : "—"}</TableCell>
                    <TableCell className="hidden text-right text-muted-foreground lg:table-cell">{m.lastCountAt ? formatDate(m.lastCountAt) : "never"}</TableCell>
                    <TableCell>{!m.active ? <StatusBadge tone="neutral">Unused</StatusBadge> : isLow ? <StatusBadge tone="warning">Low</StatusBadge> : <StatusBadge tone="success">OK</StatusBadge>}</TableCell>
                    {editable ? (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <MaterialMovementDialog material={m} kind="purchase" vendors={vendors} date={today} trigger={<Button variant="outline" size="xs" />} />
                          <MaterialMovementDialog material={m} kind="issue" vendors={vendors} date={today} trigger={<Button variant="outline" size="xs" />} />
                          <MaterialMovementDialog material={m} kind="count" vendors={vendors} date={today} trigger={<Button variant="ghost" size="xs" />} />
                        </div>
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
