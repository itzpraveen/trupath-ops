import { cn } from "cn";
import { Label } from "@/components/ui/label";

export function Field({
  label,
  name,
  error,
  hint,
  children,
  className,
  required,
}: {
  label: React.ReactNode;
  name?: string;
  error?: string[] | string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
}) {
  const msg = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={name}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
      {msg ? <p className="text-xs text-destructive">{msg}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function FormRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2", className)}>{children}</div>;
}
