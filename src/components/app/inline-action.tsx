"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import type { ActionState } from "@/lib/forms";
import { Button } from "@/components/ui/button";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** A single button that submits hidden fields to a server action and toasts the result. */
export function InlineAction({ action, hidden, children, variant = "ghost", size = "xs", className }: { action: Action; hidden: Record<string, string>; children: React.ReactNode; variant?: "ghost" | "outline" | "default" | "destructive"; size?: "xs" | "sm" | "default"; className?: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  useEffect(() => {
    if (state?.ok) toast.success(state.message ?? "Done");
    else if (state?.error) toast.error(state.error);
  }, [state]);
  return (
    <form action={formAction} className="inline">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button type="submit" variant={variant} size={size} disabled={pending} className={className}>
        {children}
      </Button>
    </form>
  );
}
