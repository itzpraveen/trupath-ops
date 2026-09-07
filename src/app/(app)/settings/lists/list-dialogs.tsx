"use client";

import { saveBrand, saveCategory } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/field";
import { FormDialog } from "@/components/app/form-dialog";

export function AddCategoryDialog({ kind, label }: { kind: string; label: string }) {
  return (
    <FormDialog trigger={<Button variant="outline" size="xs" />} triggerLabel="Add" title={`Add ${label.toLowerCase()}`} action={saveCategory} submitLabel="Add">
      {(state) => (
        <>
          <input type="hidden" name="kind" value={kind} />
          <Field label="Name" name="name" error={state?.fieldErrors?.name} required>
            <Input id="name" name="name" required autoFocus />
          </Field>
        </>
      )}
    </FormDialog>
  );
}

export function BrandDialog({ brand }: { brand?: { id: string; name: string; active: boolean } }) {
  return (
    <FormDialog trigger={brand ? <Button variant="ghost" size="xs" /> : <Button variant="outline" size="xs" />} triggerLabel={brand ? "Edit" : "Add brand"} title={brand ? `Edit ${brand.name}` : "Add brand"} action={saveBrand} submitLabel="Save">
      {(state) => (
        <>
          {brand ? <input type="hidden" name="id" value={brand.id} /> : null}
          <Field label="Brand name" name="name" error={state?.fieldErrors?.name} required>
            <Input id="name" name="name" defaultValue={brand?.name ?? ""} required autoFocus />
          </Field>
          {brand ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={brand.active} className="size-4 accent-primary" />
              Active
            </label>
          ) : null}
        </>
      )}
    </FormDialog>
  );
}
