import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { cn } from "cn";
import { db } from "@/db";
import { materialMovements, materials, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime, todayIST } from "@/lib/dates";
import { formatINR, formatQty } from "@/lib/money";
import { canEdit } from "@/lib/permissions";
import { getContacts } from "@/lib/queries/common";
import { Button } from "@/components/ui/button";
import { PageHeader, Section } from "@/components/app/page-header";
import { Stat, StatGrid } from "@/components/app/stat";
import { Table, TableBody, TableCard, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/app/data-table";
import { MaterialDialog, MaterialMovementDialog } from "../material-dialogs";

export const metadata: Metadata = { title: "Material" };
const KIND_LABEL: Record<string, string> = { purchase: "Purchase", issue: "Used", return: "Returned", jobwork_out: "Sent for job work", jobwork_in: "Back from job work", adjustment: "Adjustment", count: "Stock count" };

export default async function MaterialPage(props: PageProps<"/factory/materials/[id]">) {
  const user = await requireUser("materials");
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [m] = await db.select().from(materials).where(eq(materials.id, id)).limit(1);
  if (!m) notFound();
  const moves = await db
    .select({ mv: materialMovements, userName: users.name })
    .from(materialMovements)
    .leftJoin(users, eq(users.id, materialMovements.userId))
    .where(eq(materialMovements.materialId, id))
    .orderBy(desc(materialMovements.createdAt))
    .limit(200);
  const vendors = (await getContacts()).filter((c) => c.type !== "customer").map((c) => ({ id: c.id, name: c.name }));
  const editable = canEdit(user.role, "materials");
  const today = todayIST();
  const isLow = m.minQty > 0 && m.qty <= m.minQty;

  return (
    <>
      <PageHeader title={m.name} description={`${m.code} · measured in ${m.unit}`} backHref="/factory/materials" backLabel="Raw materials">
        {editable ? (
          <>
            <MaterialMovementDialog material={m} kind="purchase" vendors={vendors} date={today} trigger={<Button size="sm" />} />
            <MaterialMovementDialog material={m} kind="issue" vendors={vendors} date={today} trigger={<Button variant="outline" size="sm" />} />
            <MaterialMovementDialog material={m} kind="return" vendors={vendors} date={today} trigger={<Button variant="outline" size="sm" />} />
            <MaterialMovementDialog material={m} kind="adjustment" vendors={vendors} date={today} trigger={<Button variant="outline" size="sm" />} />
            <MaterialMovementDialog material={m} kind="count" vendors={vendors} date={today} trigger={<Button variant="outline" size="sm" />} />
            <MaterialDialog material={m} />
          </>
        ) : null}
      </PageHeader>
      <StatGrid className="mb-6">
        <Stat label="In stock" value={formatQty(m.qty, m.unit)} tone={isLow ? "warning" : "primary"} hint={m.minQty ? `minimum ${formatQty(m.minQty)}` : "no minimum set"} />
        <Stat label="Cost per unit" value={m.costP ? formatINR(m.costP, { exact: true }) : "—"} />
        <Stat label="Stock value" value={formatINR(Math.round(m.qty * m.costP))} />
        <Stat label="Last counted" value={m.lastCountAt ? formatDate(m.lastCountAt, "d MMM") : "never"} />
      </StatGrid>
      <Section title="History">
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>What</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Balance</TableHead>
                <TableHead className="hidden md:table-cell">Reference</TableHead>
                <TableHead className="hidden lg:table-cell">By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {moves.length === 0 ? (
                <TableEmpty colSpan={6}>No movements yet.</TableEmpty>
              ) : (
                moves.map(({ mv, userName }) => (
                  <TableRow key={mv.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(mv.createdAt)}</TableCell>
                    <TableCell>
                      {KIND_LABEL[mv.kind] ?? mv.kind}
                      {mv.note ? <span className="block max-w-72 truncate text-xs text-muted-foreground">{mv.note}</span> : null}
                    </TableCell>
                    <TableCell className={cn("tabular text-right font-medium", mv.qty > 0 ? "text-success" : mv.qty < 0 ? "text-destructive" : "")}>
                      {mv.qty > 0 ? "+" : ""}
                      {formatQty(mv.qty)}
                    </TableCell>
                    <TableCell className="tabular hidden text-right sm:table-cell">{formatQty(mv.afterQty)}</TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{mv.refId ?? ""}</TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{userName ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableCard>
      </Section>
    </>
  );
}
