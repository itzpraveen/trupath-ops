"use client";

import { Plus } from "lucide-react";
import { createProduction } from "@/actions/factory";
import type { ProductOption } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormRow } from "@/components/app/field";
import { FormDialog } from "@/components/app/form-dialog";
import { ProductPicker } from "@/components/app/product-picker";

export function ProductionDialog({ products, employees, date, bomProductIds }: { products: ProductOption[]; employees: { id: string; name: string }[]; date: string; bomProductIds: string[] }) {
  return (
    <FormDialog trigger={<Button size="sm" />} triggerLabel="Record production" title="Record production" description="What was finished today. Stock goes up, and materials in the recipe are used up." action={createProduction} submitLabel="Record production" wide>
      {(state) => {
        const fe = state?.fieldErrors ?? {};
        return (
          <>
            <Field label="Product" name="productId" error={fe.productId} required hint={bomProductIds.length ? undefined : "Tip: add material recipes so raw materials are deducted automatically."}>
              <ProductPicker products={products} required autoFocus />
            </Field>
            <FormRow>
              <Field label="Quantity made" name="qty" error={fe.qty} required>
                <Input id="qty" name="qty" type="number" inputMode="numeric" min={1} step={1} required className="h-10 text-lg" />
              </Field>
              <Field label="Date" name="workDate" error={fe.workDate} required>
                <Input id="workDate" name="workDate" type="date" defaultValue={date} required />
              </Field>
            </FormRow>
            <FormRow>
              <Field label="Made by" name="employeeId" error={fe.employeeId}>
                <NativeSelect id="employeeId" name="employeeId" defaultValue="">
                  <option value="">Not specified</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Or worker name" name="workerName" error={fe.workerName}>
                <Input id="workerName" name="workerName" placeholder="Outside worker / team" />
              </Field>
            </FormRow>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="consumeMaterials" defaultChecked className="mt-0.5 size-4 accent-primary" />
              <span>
                Use up raw materials as per the product&apos;s recipe
                <span className="block text-xs text-muted-foreground">Skips silently if the product has no recipe yet.</span>
              </span>
            </label>
            <Field label="Note" name="note" error={fe.note}>
              <Textarea id="note" name="note" rows={2} placeholder="Batch, print, anything worth remembering" />
            </Field>
          </>
        );
      }}
    </FormDialog>
  );
}

export { Plus };
