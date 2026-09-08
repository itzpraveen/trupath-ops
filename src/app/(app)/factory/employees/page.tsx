import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { canEdit } from "@/lib/permissions";
import { getCategories, getEmployees } from "@/lib/queries/common";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCard, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/app/data-table";
import { EmployeeDialog } from "./employee-dialog";

export const metadata: Metadata = { title: "Staff" };

export default async function EmployeesPage() {
  const user = await requireUser("attendance");
  const [staff, designations] = await Promise.all([getEmployees(false), getCategories("designation")]);
  const editable = canEdit(user.role, "attendance");
  const nextCode = String(staff.reduce((m, s) => Math.max(m, Number(s.code) || 0), 0) + 1);
  const names = designations.map((d) => d.name);

  return (
    <>
      <PageHeader title="Staff" description="Factory and office staff. Job roles describe their work; login access is managed separately." backHref="/factory" backLabel="Daily register">
        {editable ? <EmployeeDialog designations={names} nextCode={nextCode} /> : null}
      </PageHeader>
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Job role</TableHead>
              <TableHead className="hidden sm:table-cell">Phone</TableHead>
              <TableHead className="hidden md:table-cell">Joined</TableHead>
              <TableHead className="text-right">Daily wage</TableHead>
              <TableHead>Status</TableHead>
              {editable ? <TableHead className="w-16" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.length === 0 ? (
              <TableEmpty colSpan={8}>No staff yet. Add your factory and office team.</TableEmpty>
            ) : (
              staff.map((s) => (
                <TableRow key={s.id} className={s.active ? "" : "opacity-60"}>
                  <TableCell className="text-muted-foreground">#{s.code}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.designation || "—"}</TableCell>
                  <TableCell className="hidden sm:table-cell">{s.phone ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{formatDate(s.joinedAt)}</TableCell>
                  <TableCell className="tabular text-right">{s.dailyWageP ? formatINR(s.dailyWageP) : "—"}</TableCell>
                  <TableCell>
                    <StatusBadge tone={s.active ? "success" : "neutral"}>{s.active ? "Active" : "Left"}</StatusBadge>
                  </TableCell>
                  {editable ? (
                    <TableCell className="text-right">
                      <EmployeeDialog employee={s} designations={names.includes(s.designation) || !s.designation ? names : [s.designation, ...names]} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableCard>
    </>
  );
}
