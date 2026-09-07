"use client";

import { saveEntity } from "@/actions/settings";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ActionForm } from "@/components/app/action-form";
import { Field, FormRow } from "@/components/app/field";

export function EntityForm({ entity }: { entity: { id: string; name: string; legalName: string | null; gstin: string | null; address: string | null; stateCode: string | null; phone: string | null; email: string | null } }) {
  return (
    <ActionForm action={saveEntity} submitLabel="Save" className="space-y-4 rounded-xl border bg-card p-4">
      {(state) => {
        const fe = state?.fieldErrors ?? {};
        return (
          <>
            <input type="hidden" name="id" value={entity.id} />
            <FormRow>
              <Field label="Short name" name={`name-${entity.id}`} error={fe.name} required>
                <Input id={`name-${entity.id}`} name="name" defaultValue={entity.name} required />
              </Field>
              <Field label="Legal name (on challans)" name={`legalName-${entity.id}`} error={fe.legalName}>
                <Input id={`legalName-${entity.id}`} name="legalName" defaultValue={entity.legalName ?? ""} />
              </Field>
            </FormRow>
            <FormRow>
              <Field label="GSTIN" name={`gstin-${entity.id}`} error={fe.gstin}>
                <Input id={`gstin-${entity.id}`} name="gstin" defaultValue={entity.gstin ?? ""} className="uppercase" />
              </Field>
              <Field label="State code" name={`stateCode-${entity.id}`} error={fe.stateCode}>
                <Input id={`stateCode-${entity.id}`} name="stateCode" defaultValue={entity.stateCode ?? "32"} />
              </Field>
            </FormRow>
            <FormRow>
              <Field label="Phone" name={`phone-${entity.id}`} error={fe.phone}>
                <Input id={`phone-${entity.id}`} name="phone" defaultValue={entity.phone ?? ""} />
              </Field>
              <Field label="Email" name={`email-${entity.id}`} error={fe.email}>
                <Input id={`email-${entity.id}`} name="email" defaultValue={entity.email ?? ""} />
              </Field>
            </FormRow>
            <Field label="Address" name={`address-${entity.id}`} error={fe.address}>
              <Textarea id={`address-${entity.id}`} name="address" rows={3} defaultValue={entity.address ?? ""} />
            </Field>
          </>
        );
      }}
    </ActionForm>
  );
}
