import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { Download } from "lucide-react";
import { cn } from "cn";
import { db } from "@/db";
import { attendance, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { monthKey, monthRange, todayIST } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { buttonVariants } from "@/components/ui/button";
import { MonthNav } from "@/components/app/month-nav";
import { PageHeader } from "@/components/app/page-header";
import { Stat, StatGrid } from "@/components/app/stat";

export const metadata: Metadata = { title: "Attendance" };

const CELL: Record<string, { short: string; cls: string }> = {
  present: { short: "P", cls: "bg-success/15 text-success" },
  half_day: { short: "½", cls: "bg-warning/20 text-warning" },
  absent: { short: "A", cls: "bg-destructive/10 text-destructive" },
  leave: { short: "L", cls: "bg-accent text-accent-foreground" },
  holiday: { short: "H", cls: "bg-muted text-muted-foreground" },
};

export default async function AttendancePage(props: PageProps<"/factory/attendance">) {
  await requireUser("attendance");
  const sp = await props.searchParams;
  const month = /^\d{4}-\d{2}$/.test(String(sp.month ?? "")) ? String(sp.month) : monthKey();
  const [from, to] = monthRange(month);
  const today = todayIST();
  const daysInMonth = Number(to.slice(8, 10));
  const days = Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);

  const marks = await db.select().from(attendance).where(and(gte(attendance.workDate, from), lte(attendance.workDate, to)));
  // current staff, plus anyone who left but was marked this month (their wages are still due)
  const markedIds = [...new Set(marks.map((m) => m.employeeId))];
  const staff = await db
    .select()
    .from(employees)
    .where(markedIds.length ? or(eq(employees.active, true), inArray(employees.id, markedIds)) : eq(employees.active, true))
    .orderBy(desc(employees.active), employees.code);
  const activeCount = staff.filter((s) => s.active).length;
  const byEmp = new Map<string, Map<string, string>>();
  for (const m of marks) {
    if (!byEmp.has(m.employeeId)) byEmp.set(m.employeeId, new Map());
    byEmp.get(m.employeeId)!.set(m.workDate, m.status);
  }
  const summary = staff.map((s) => {
    const map = byEmp.get(s.id) ?? new Map<string, string>();
    const count = (st: string) => [...map.values()].filter((v) => v === st).length;
    const present = count("present");
    const half = count("half_day");
    const payable = Math.round(s.dailyWageP * (present + half / 2));
    return { s, map, present, half, absent: count("absent"), leave: count("leave"), payable };
  });
  const totalPayable = summary.reduce((a, r) => a + r.payable, 0);
  const totalPresentDays = summary.reduce((a, r) => a + r.present + r.half / 2, 0);

  return (
    <>
      <PageHeader title="Attendance" description="Month at a glance. Tap a date to mark or correct that day in the register." backHref="/factory" backLabel="Daily register">
        <Link href={`/api/export/attendance?month=${month}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Download /> Export CSV
        </Link>
        <MonthNav month={month} basePath="/factory/attendance" />
      </PageHeader>
      <StatGrid className="mb-6">
        <Stat label="Staff" value={activeCount} hint={staff.length > activeCount ? `${staff.length - activeCount} left during the month` : undefined} />
        <Stat label="Present days" value={totalPresentDays} hint="half days count as ½" />
        <Stat label="Wages payable" value={formatINR(totalPayable)} hint="daily wage × present days" />
        <Stat label="Marked today" value={marks.filter((m) => m.workDate === today).length} hint={`of ${activeCount}`} />
      </StatGrid>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs">
              <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left font-medium">Staff</th>
              {days.map((d) => {
                const dow = new Date(`${d}T00:00:00`).getDay();
                return (
                  <th key={d} className={cn("px-1 py-2 text-center font-medium", dow === 0 && "text-destructive/70", d === today && "text-primary")}>
                    <Link href={`/factory?date=${d}`} className="block rounded px-1 hover:bg-muted">{Number(d.slice(8, 10))}</Link>
                  </th>
                );
              })}
              <th className="px-2 py-2 text-right font-medium">P</th>
              <th className="px-2 py-2 text-right font-medium">½</th>
              <th className="px-2 py-2 text-right font-medium">A</th>
              <th className="px-2 py-2 text-right font-medium">L</th>
              <th className="px-3 py-2 text-right font-medium">Wages</th>
            </tr>
          </thead>
          <tbody>
            {summary.length === 0 ? (
              <tr>
                <td colSpan={days.length + 6} className="px-3 py-10 text-center text-muted-foreground">
                  No active staff. <Link href="/factory/employees" className="text-primary hover:underline">Add staff</Link>
                </td>
              </tr>
            ) : (
              summary.map(({ s, map, present, half, absent, leave, payable }) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="sticky left-0 z-10 bg-card px-3 py-1.5 font-medium whitespace-nowrap">
                    {s.name} <span className="text-xs font-normal text-muted-foreground">#{s.code}</span>
                    {!s.active ? <span className="ml-1 text-xs font-normal text-muted-foreground">(left)</span> : null}
                  </td>
                  {days.map((d) => {
                    const st = map.get(d);
                    const c = st ? CELL[st] : null;
                    return (
                      <td key={d} className="px-0.5 py-1 text-center">
                        <Link href={`/factory?date=${d}`} className={cn("mx-auto grid size-7 place-items-center rounded text-xs font-semibold", c ? c.cls : d <= today ? "text-muted-foreground/40" : "text-transparent")}>
                          {c ? c.short : d <= today ? "·" : ""}
                        </Link>
                      </td>
                    );
                  })}
                  <td className="tabular px-2 py-1.5 text-right">{present}</td>
                  <td className="tabular px-2 py-1.5 text-right">{half}</td>
                  <td className="tabular px-2 py-1.5 text-right">{absent}</td>
                  <td className="tabular px-2 py-1.5 text-right">{leave}</td>
                  <td className="tabular px-3 py-1.5 text-right font-medium">{s.dailyWageP ? formatINR(payable) : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Set each person&apos;s daily wage on the Staff page to get the wages column.</p>
    </>
  );
}
