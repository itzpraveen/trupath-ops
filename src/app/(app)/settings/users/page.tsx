import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { ROLE_LABELS } from "@/lib/permissions";
import { Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/app/data-table";
import { AddUserDialog, EditUserDialog } from "./user-dialogs";

export const metadata: Metadata = { title: "Logins" };

export default async function UsersPage() {
  const me = await requireUser("settings");
  const rows = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt }).from(users).orderBy(asc(users.name));
  return (
    <Section title="Logins" description="One login per person. Give each the smallest role that covers their work." actions={<AddUserDialog />}>
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden sm:table-cell">Last sign-in</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  {u.name}
                  {u.id === me.id ? <span className="ml-1 text-xs text-muted-foreground">(you)</span> : null}
                </TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>{ROLE_LABELS[u.role]}</TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "never"}</TableCell>
                <TableCell>
                  <StatusBadge tone={u.active ? "success" : "neutral"}>{u.active ? "Active" : "Disabled"}</StatusBadge>
                </TableCell>
                <TableCell className="text-right">
                  <EditUserDialog user={u} isSelf={u.id === me.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </Section>
  );
}
