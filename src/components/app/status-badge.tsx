import { cn } from "cn";

const TONES: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-accent text-accent-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

export function StatusBadge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: keyof typeof TONES; className?: string }) {
  return <span className={cn("inline-flex h-6 items-center rounded-md px-2 text-xs font-medium capitalize", TONES[tone], className)}>{children}</span>;
}

export const DISPATCH_TONE: Record<string, keyof typeof TONES> = {
  pending: "warning",
  packed: "info",
  shipped: "info",
  delivered: "success",
  returned: "destructive",
  cancelled: "neutral",
};
export const JOBWORK_TONE: Record<string, keyof typeof TONES> = {
  draft: "neutral",
  sent: "info",
  partial: "warning",
  received: "success",
  closed: "success",
  cancelled: "neutral",
};
export const ATTENDANCE_TONE: Record<string, keyof typeof TONES> = {
  present: "success",
  half_day: "warning",
  absent: "destructive",
  leave: "info",
  holiday: "neutral",
};
