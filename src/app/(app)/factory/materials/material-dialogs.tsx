"use client";

import { recordMaterialMovement, saveMaterial } from "@/actions/materials";
import type { Material } from "@/db/schema";
import { toRupees } from "@/lib/money";
import { PAYMENT_METHODS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormRow } from "@/components/app/field";
import { FormDialog } from "@/components/app/form-dialog";

const UNITS = ["metres", "kg", "pieces", "sheets", "rolls", "litres", "packets"];

export function MaterialDialog({ material, nextCode }: { material?: Material; nextCode?: string }) {
  return (
    <FormDialog trigger={material ? <Button variant="outline" size="sm" /> : <Button size="sm" />} triggerLabel={material ? "Edit details" : "Add material"} title={material ? `Edit ${material.name}` : "Add material"} action={saveMaterial} submitLabel={material ? "Save changes" : "Add material"}>
      {(state) => {
        const fe = state?.fieldErrors ?? {};
        return (
          <>
            {material ? <input type="hidden" name="id" value={material.id} /> : null}
            <FormRow>
              <Field label="Code" name="code" error={fe.code} required>
                <Input id="code" name="code" defaultValue={material?.code ?? nextCode ?? ""} required />
              </Field>
              <Field label="Name" name="name" error={fe.name} required>
                <Input id="name" name="name" defaultValue={material?.name ?? ""} required autoFocus={!material} />
              </Field>
            </FormRow>
            <FormRow>
              <Field label="Unit" name="unit" error={fe.unit} required>
                <NativeSelect id="unit" name="unit" defaultValue={material?.unit ?? "metres"}>
                  {(material && !UNITS.includes(material.unit) ? [material.unit, ...UNITS] : UNITS).map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Minimum stock" name="minQty" error={fe.minQty} hint="Alerts show when stock falls to this level.">
                <Input id="minQty" name="minQty" type="number" step="0.001" min={0} defaultValue={material?.minQty ?? ""} />
              </Field>
            </FormRow>
            <FormRow>
              <Field label="Cost per unit (₹)" name="costP" error={fe.costP}>
                <Input id="costP" name="costP" inputMode="decimal" defaultValue={material?.costP ? toRupees(material.costP) : ""} />
              </Field>
              {!material ? (
                <Field label="Opening stock" name="openingQty" error={fe.openingQty}>
                  <Input id="openingQty" name="openingQty" type="number" step="0.001" min={0} />
                </Field>
              ) : null}
            </FormRow>
            {material ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={material.active} className="size-4 accent-primary" />
                In use
              </label>
            ) : null}
          </>
        );
      }}
    </FormDialog>
  );
}

const KIND_META = {
  purchase: { title: "Record purchase", description: "Material bought and received into the store.", submit: "Add to stock" },
  issue: { title: "Record usage", description: "Material taken out for production or other use.", submit: "Take from stock" },
  return: { title: "Record return", description: "Unused material coming back into the store.", submit: "Add to stock" },
  adjustment: { title: "Adjust stock", description: "Correct the balance up or down.", submit: "Adjust" },
  count: { title: "Stock count", description: "Enter the quantity you physically counted. The balance is set to this number.", submit: "Save count" },
} as const;
const TRIGGER_LABEL: Record<keyof typeof KIND_META, string> = { purchase: "Purchase", issue: "Use", return: "Return", adjustment: "Adjust", count: "Count" };

export function MaterialMovementDialog({
  material,
  kind,
  vendors,
  date,
  trigger,
  triggerLabel,
}: {
  material: Pick<Material, "id" | "name" | "unit" | "qty" | "costP">;
  kind: keyof typeof KIND_META;
  vendors: { id: string; name: string }[];
  date: string;
  trigger?: React.ReactElement;
  triggerLabel?: React.ReactNode;
}) {
  const meta = KIND_META[kind];
  return (
    <FormDialog trigger={trigger ?? <Button variant="outline" size="xs" />} triggerLabel={triggerLabel ?? TRIGGER_LABEL[kind]} title={`${meta.title}: ${material.name}`} description={meta.description} action={recordMaterialMovement} submitLabel={meta.submit}>
      {(state) => {
        const fe = state?.fieldErrors ?? {};
        return (
          <>
            <input type="hidden" name="materialId" value={material.id} />
            <input type="hidden" name="kind" value={kind} />
            <p className="text-sm text-muted-foreground">
              Current balance: <span className="tabular font-medium text-foreground">{material.qty} {material.unit}</span>
            </p>
            <FormRow>
              <Field label={kind === "count" ? `Counted quantity (${material.unit})` : `Quantity (${material.unit})`} name="qty" error={fe.qty} required>
                <Input id="qty" name="qty" type="number" step="0.001" min={0} required autoFocus className="h-10 text-lg" />
              </Field>
              <Field label="Date" name="workDate" error={fe.workDate}>
                <Input id="workDate" name="workDate" type="date" defaultValue={date} />
              </Field>
            </FormRow>
            {kind === "adjustment" ? (
              <Field label="Direction" name="direction" error={fe.direction}>
                <NativeSelect id="direction" name="direction" defaultValue="add">
                  <option value="add">Add to stock</option>
                  <option value="remove">Remove from stock</option>
                </NativeSelect>
              </Field>
            ) : null}
            {kind === "purchase" ? (
              <>
                <FormRow>
                  <Field label={`Cost per ${material.unit} (₹)`} name="unitCostP" error={fe.unitCostP}>
                    <Input id="unitCostP" name="unitCostP" inputMode="decimal" defaultValue={material.costP ? toRupees(material.costP) : ""} />
                  </Field>
                  <Field label="Supplier" name="contactId" error={fe.contactId}>
                    <NativeSelect id="contactId" name="contactId" defaultValue="">
                      <option value="">Not specified</option>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </FormRow>
                <FormRow>
                  <Field label="Bill no." name="reference" error={fe.reference}>
                    <Input id="reference" name="reference" />
                  </Field>
                  <Field label="Paid via" name="paymentMethod" error={fe.paymentMethod}>
                    <NativeSelect id="paymentMethod" name="paymentMethod" defaultValue="upi">
                      {PAYMENT_METHODS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </FormRow>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="recordExpense" defaultChecked className="mt-0.5 size-4 accent-primary" />
                  <span>
                    Also record this as a purchase in the factory books
                    <span className="block text-xs text-muted-foreground">Amount = quantity × cost per unit. Needs a cost to be entered.</span>
                  </span>
                </label>
              </>
            ) : null}
            <Field label="Note" name="note" error={fe.note}>
              <Textarea id="note" name="note" rows={2} placeholder={kind === "issue" ? "What it was used for" : ""} />
            </Field>
          </>
        );
      }}
    </FormDialog>
  );
}
