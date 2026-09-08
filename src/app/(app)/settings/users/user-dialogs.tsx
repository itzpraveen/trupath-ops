"use client";

import { createUser, updateUser } from "@/actions/settings";
import type { Role, SafeUser } from "@/db/schema";
import { ROLE_LABELS } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FormRow } from "@/components/app/field";
import { FormDialog } from "@/components/app/form-dialog";

const ROLE_HELP: Record<Role, string> = {
  owner: "Everything, including settings and logins.",
  accounts: "Sales, expenses, payments, orders, reports and contacts.",
  factory: "Daily register, production, materials, attendance and job work.",
  inventory: "Finished stock, dispatch, website orders and products.",
};

function RoleSelect({ defaultValue }: { defaultValue: Role }) {
  return (
    <NativeSelect id="role" name="role" defaultValue={defaultValue}>
      {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]} — {ROLE_HELP[r]}
        </option>
      ))}
    </NativeSelect>
  );
}

export function AddUserDialog() {
  return (
    <FormDialog trigger={<Button size="sm" />} triggerLabel="Add login" title="Add a login" description="Share the password with them directly. They can change it from their account menu." action={createUser} submitLabel="Create login">
      {(state) => {
        const fe = state?.fieldErrors ?? {};
        return (
          <>
            <FormRow>
              <Field label="Name" name="name" error={fe.name} required>
                <Input id="name" name="name" required autoFocus />
              </Field>
              <Field label="Email" name="email" error={fe.email} required>
                <Input id="email" name="email" type="email" required />
              </Field>
            </FormRow>
            <Field label="Password" name="password" error={fe.password} required hint="At least 8 characters.">
              <Input id="password" name="password" type="text" autoComplete="new-password" required />
            </Field>
            <Field label="Role" name="role" error={fe.role}>
              <RoleSelect defaultValue="factory" />
            </Field>
          </>
        );
      }}
    </FormDialog>
  );
}

export function EditUserDialog({ user, isSelf }: { user: SafeUser; isSelf: boolean }) {
  return (
    <FormDialog trigger={<Button variant="ghost" size="xs" />} triggerLabel="Edit" title={`Edit ${user.name}`} action={updateUser} submitLabel="Save">
      {(state) => {
        const fe = state?.fieldErrors ?? {};
        return (
          <>
            <input type="hidden" name="id" value={user.id} />
            <Field label="Name" name="name" error={fe.name} required>
              <Input id="name" name="name" defaultValue={user.name} required />
            </Field>
            <Field label="Role" name="role" error={fe.role}>
              <RoleSelect defaultValue={user.role} />
            </Field>
            <Field label="New password" name="password" error={fe.password} hint="Leave blank to keep the current password. Setting one signs them out everywhere.">
              <Input id="password" name="password" type="text" autoComplete="new-password" />
            </Field>
            {/* a disabled checkbox is not submitted, so carry the value for your own login explicitly */}
            {isSelf ? <input type="hidden" name="active" value="on" /> : null}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={user.active} disabled={isSelf} className="size-4 accent-primary" />
              Can sign in
            </label>
          </>
        );
      }}
    </FormDialog>
  );
}
