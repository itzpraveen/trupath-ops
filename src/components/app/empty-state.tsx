import { cn } from "cn";

export function EmptyState({ title, description, children, className }: { title: string; description?: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card/50 px-6 py-12 text-center", className)}>
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {children ? <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}
