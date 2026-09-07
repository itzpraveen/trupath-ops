"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINRCompact, formatINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";

export function SalesExpensesChart({ data }: { data: { date: string; sales: number; expenses: number; returns: number }[] }) {
  const hasData = data.some((d) => d.sales || d.expenses || d.returns);
  if (!hasData) {
    return <div className="grid h-56 place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">No entries in this period yet.</div>;
  }
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="date" tickFormatter={(v) => formatDate(v, "d MMM")} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tickFormatter={(v) => formatINRCompact(Number(v))} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={56} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, color: "var(--popover-foreground)" }}
            labelFormatter={(v) => formatDate(String(v))}
            formatter={(value, name) => [formatINR(Number(value)), name === "sales" ? "Sales" : name === "expenses" ? "Expenses" : "Returns"]}
          />
          <Bar dataKey="sales" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="expenses" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
