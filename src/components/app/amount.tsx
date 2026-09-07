import { cn } from "cn";
import { formatINR } from "@/lib/money";

export function Amount({ paise, tone, className, exact }: { paise: number | null | undefined; tone?: "in" | "out" | "neutral"; className?: string; exact?: boolean }) {
  return (
    <span className={cn("tabular", tone === "in" && "text-success", tone === "out" && "text-destructive", className)}>
      {formatINR(paise, { exact })}
    </span>
  );
}
