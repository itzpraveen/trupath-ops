"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import type { ActionState } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "./submit-button";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function ConfirmAction({
  trigger,
  title,
  description,
  action,
  hidden = {},
  confirmLabel = "Confirm",
  destructive,
  withReason,
  reasonLabel = "Reason",
  children,
}: {
  trigger: React.ReactElement;
  title: string;
  description?: string;
  action: Action;
  hidden?: Record<string, string>;
  confirmLabel?: string;
  destructive?: boolean;
  withReason?: boolean;
  reasonLabel?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result?.ok) {
      toast.success(result.message ?? "Done");
      setOpen(false);
    }
    return result;
  }, null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger}>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          {withReason ? (
            <div className="space-y-1.5">
              <Label htmlFor="reason">{reasonLabel}</Label>
              <Textarea id="reason" name="reason" rows={2} required />
            </div>
          ) : null}
          {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton variant={destructive ? "destructive" : "default"}>{confirmLabel}</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
