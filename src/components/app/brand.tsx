export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-base font-bold text-sidebar-primary-foreground">T</span>
      {!compact ? (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold">TruPath Ops</p>
          <p className="truncate text-xs text-sidebar-foreground/65">Trupaths Ventures</p>
        </div>
      ) : null}
    </div>
  );
}
