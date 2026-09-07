"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionState } from "@/lib/forms";
import { SubmitButton } from "./submit-button";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Inline (non-dialog) server-action form with toast feedback. */
export function ActionForm({
  action,
  children,
  submitLabel = "Save",
  className,
  redirectTo,
  footer,
}: {
  action: Action;
  children: React.ReactNode | ((state: ActionState) => React.ReactNode);
  submitLabel?: string;
  className?: string;
  redirectTo?: string | ((state: NonNullable<ActionState>) => string);
  footer?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Saved");
      if (redirectTo) router.push(typeof redirectTo === "function" ? redirectTo(state) : redirectTo);
    } else if (state?.error && !state.fieldErrors) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={formAction} className={className ?? "space-y-4"}>
      {typeof children === "function" ? children(state) : children}
      {state?.error && state.fieldErrors ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div className="flex items-center justify-end gap-2">
        {footer}
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
