import { cn } from "cn";

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "primary" | "warning" | "destructive" | "success";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card px-4 py-3.5",
        tone === "primary" && "border-primary/30 bg-accent/60",
        tone === "warning" && "border-warning/40 bg-warning/10",
        tone === "destructive" && "border-destructive/30 bg-destructive/5",
        tone === "success" && "border-success/30 bg-success/5",
        className,
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold leading-none">{value}</p>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>{children}</div>;
}
