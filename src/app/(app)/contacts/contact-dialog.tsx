"use client";

import { saveContact } from "@/actions/contacts";
import type { Contact } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormRow } from "@/components/app/field";
import { FormDialog } from "@/components/app/form-dialog";

export function ContactDialog({ contact, defaultType = "customer", trigger, triggerLabel }: { contact?: Contact; defaultType?: string; trigger?: React.ReactElement; triggerLabel?: React.ReactNode }) {
  return (
    <FormDialog trigger={trigger ?? (contact ? <Button variant="ghost" size="xs" /> : <Button size="sm" />)} triggerLabel={triggerLabel ?? (contact ? "Edit" : "Add contact")} title={contact ? `Edit ${contact.name}` : "Add contact"} action={saveContact} submitLabel={contact ? "Save changes" : "Add contact"} wide>
      {(state) => {
        const fe = state?.fieldErrors ?? {};
        return (
          <>
            {contact ? <input type="hidden" name="id" value={contact.id} /> : null}
            <FormRow>
              <Field label="Type" name="type" error={fe.type}>
                <NativeSelect id="type" name="type" defaultValue={contact?.type ?? defaultType}>
                  <option value="customer">Customer</option>
                  <option value="vendor">Supplier / vendor</option>
                  <option value="job_worker">Job worker</option>
                </NativeSelect>
              </Field>
              <Field label="Name" name="name" error={fe.name} required>
                <Input id="name" name="name" defaultValue={contact?.name ?? ""} required autoFocus={!contact} />
              </Field>
            </FormRow>
            <FormRow>
              <Field label="Phone" name="phone" error={fe.phone}>
                <Input id="phone" name="phone" inputMode="tel" defaultValue={contact?.phone ?? ""} />
              </Field>
              <Field label="Email" name="email" error={fe.email}>
                <Input id="email" name="email" inputMode="email" defaultValue={contact?.email ?? ""} />
              </Field>
            </FormRow>
            <FormRow>
              <Field label="GSTIN" name="gstin" error={fe.gstin}>
                <Input id="gstin" name="gstin" defaultValue={contact?.gstin ?? ""} className="uppercase" />
              </Field>
              <Field label="State code" name="stateCode" error={fe.stateCode} hint="Kerala is 32.">
                <Input id="stateCode" name="stateCode" defaultValue={contact?.stateCode ?? "32"} />
              </Field>
            </FormRow>
            <Field label="Address" name="address" error={fe.address}>
              <Textarea id="address" name="address" rows={2} defaultValue={contact?.address ?? ""} />
            </Field>
            <Field label="Notes" name="notes" error={fe.notes}>
              <Textarea id="notes" name="notes" rows={2} defaultValue={contact?.notes ?? ""} />
            </Field>
            {contact ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={contact.active} className="size-4 accent-primary" />
                Active
              </label>
            ) : null}
          </>
        );
      }}
    </FormDialog>
  );
}
