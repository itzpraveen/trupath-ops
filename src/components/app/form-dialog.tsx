"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import type { ActionState } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SubmitButton } from "./submit-button";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Dialog that hosts a server-action form. Closes itself and toasts on success,
 * shows the first error inline otherwise. Children receive the action state.
 */
export function FormDialog({
  trigger,
  triggerLabel,
  title,
  description,
  action,
  submitLabel = "Save",
  children,
  wide,
  open: controlledOpen,
  onOpenChange,
  resetKey,
}: {
  trigger?: React.ReactElement;
  triggerLabel?: React.ReactNode;
  title: string;
  description?: string;
  action: Action;
  submitLabel?: string;
  children: React.ReactNode | ((state: ActionState) => React.ReactNode);
  wide?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  resetKey?: string;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const open = controlledOpen ?? innerOpen;
  const setOpen = (v: boolean) => {
    setInnerOpen(v);
    onOpenChange?.(v);
  };
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result?.ok) {
      toast.success(result.message ?? "Saved");
      setFormKey((k) => k + 1);
      setOpen(false);
    }
    return result;
  }, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger render={trigger}>{triggerLabel}</DialogTrigger> : null}
      <DialogContent className={`max-h-[calc(100dvh-2rem)] overflow-y-auto ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form action={formAction} className="space-y-4" key={resetKey ?? formKey}>
          {typeof children === "function" ? children(state) : children}
          {state?.error ? (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
