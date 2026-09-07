"use client";

import { changeOwnPassword } from "@/actions/settings";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/components/app/action-form";
import { Field } from "@/components/app/field";

export function PasswordForm() {
  return (
    <ActionForm action={changeOwnPassword} submitLabel="Change password" className="space-y-4 rounded-xl border bg-card p-4">
      {(state) => {
        const fe = state?.fieldErrors ?? {};
        return (
          <>
            <Field label="Current password" name="currentPassword" error={fe.currentPassword} required>
              <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
            </Field>
            <Field label="New password" name="newPassword" error={fe.newPassword} required hint="At least 8 characters.">
              <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required />
            </Field>
            <Field label="Repeat new password" name="confirm" error={fe.confirm} required>
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
            </Field>
          </>
        );
      }}
    </ActionForm>
  );
}
