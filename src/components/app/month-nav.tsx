import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthLabel, shiftMonth } from "@/lib/dates";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";

export function MonthNav({ month, basePath, params = {} }: { month: string; basePath: string; params?: Record<string, string | undefined> }) {
  const href = (m: string) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("month", m);
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <div className="flex items-center gap-1">
      <Link href={href(shiftMonth(month, -1))} aria-label="Previous month" className={cn(buttonVariants({ variant: "outline", size: "icon" }))}>
        <ChevronLeft />
      </Link>
      <span className="min-w-36 text-center text-sm font-medium">{monthLabel(month)}</span>
      <Link href={href(shiftMonth(month, 1))} aria-label="Next month" className={cn(buttonVariants({ variant: "outline", size: "icon" }))}>
        <ChevronRight />
      </Link>
    </div>
  );
}
