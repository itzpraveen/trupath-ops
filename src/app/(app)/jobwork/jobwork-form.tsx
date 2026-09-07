"use client";

import { useState } from "react";
import { Plus, Trash } from "lucide-react";
import { createJobWork, updateJobWork } from "@/actions/jobwork";
import type { JobWorkOrder, Material } from "@/db/schema";
import { toRupees } from "@/lib/money";
import type { ProductOption } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ActionForm } from "@/components/app/action-form";
import { Field, FormRow } from "@/components/app/field";
import { ProductPicker } from "@/components/app/product-picker";

type Line = { key: number; materialId: string; qty: string };

export function JobWorkForm({
  vendors,
  processes,
  products,
  materials,
  date,
  initial,
}: {
  vendors: { id: string; name: string }[];
  processes: string[];
  products: ProductOption[];
  materials: Pick<Material, "id" | "name" | "unit" | "qty">[];
  date: string;
  initial?: JobWorkOrder;
}) {
  const [lines, setLines] = useState<Line[]>([{ key: 0, materialId: "", qty: "" }]);
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  return (
    <ActionForm action={initial ? updateJobWork : createJobWork} submitLabel={initial ? "Save changes" : "Create order"} redirectTo={(s) => `/jobwork/${initial ? initial.id : s.id}`}>
      {(state) => {
        const fe = state?.fieldErrors ?? {};
        return (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="space-y-4">
              {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
              <div className="space-y-4 rounded-xl border bg-card p-4">
                <p className="text-sm font-medium">Work</p>
                <FormRow>
                  <Field label="Job worker" name="vendorId" error={fe.vendorId} required hint={vendors.length ? undefined : "Add job workers under Customers & vendors first."}>
                    <NativeSelect id="vendorId" name="vendorId" defaultValue={initial?.vendorId ?? ""} required>
                      <option value="">Choose…</option>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="Process" name="process" error={fe.process}>
                    <NativeSelect id="process" name="process" defaultValue={initial?.process ?? processes[0] ?? "Stitching"}>
                      {(initial && !processes.includes(initial.process) ? [initial.process, ...processes] : processes).map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </FormRow>
                <Field label="Finished product (optional)" name="productId" error={fe.productId} hint="If set, accepted pieces go straight into finished stock when received.">
                  <ProductPicker products={products} defaultValue={initial?.productId ?? undefined} />
                </Field>
                <Field label="Description" name="description" error={fe.description}>
                  <Input id="description" name="description" defaultValue={initial?.description ?? ""} placeholder="e.g. Stitch 50 nest beds, Sleepy Bear print" />
                </Field>
                <FormRow>
                  <Field label="Quantity ordered" name="orderedQty" error={fe.orderedQty} required>
                    <Input id="orderedQty" name="orderedQty" type="number" min={0} step={1} defaultValue={initial?.orderedQty ?? ""} required />
                  </Field>
                  <Field label="Rate per piece (₹)" name="ratePerUnitP" error={fe.ratePerUnitP}>
                    <Input id="ratePerUnitP" name="ratePerUnitP" inputMode="decimal" defaultValue={initial?.ratePerUnitP ? toRupees(initial.ratePerUnitP) : ""} />
                  </Field>
                </FormRow>
                <FormRow>
                  <Field label="GST on job work (%)" name="taxPct" error={fe.taxPct} hint="Usually 5% for textile job work, 0 if unregistered.">
                    <Input id="taxPct" name="taxPct" type="number" step="0.5" min={0} defaultValue={initial ? initial.taxBps / 100 : 0} />
                  </Field>
                  <span />
                </FormRow>
              </div>

              {!initial ? (
                <div className="space-y-2 rounded-xl border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Materials sent along</p>
                    <Button type="button" variant="outline" size="xs" onClick={() => setLines((ls) => [...ls, { key: Date.now(), materialId: "", qty: "" }])}>
                      <Plus /> Add material
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {lines.map((l) => {
                      const m = materials.find((x) => x.id === l.materialId);
                      return (
                        <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_7rem_2rem] items-center gap-2">
                          <NativeSelect name="materialId[]" value={l.materialId} onChange={(e) => update(l.key, { materialId: e.target.value })}>
                            <option value="">Choose material…</option>
                            {materials.map((mm) => (
                              <option key={mm.id} value={mm.id}>
                                {mm.name} ({mm.qty} {mm.unit})
                              </option>
                            ))}
                          </NativeSelect>
                          <Input name="qtySent[]" type="number" step="0.001" min={0} value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} placeholder={m?.unit ?? "qty"} aria-label="Quantity" />
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}>
                            <Trash />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  <label className="flex items-start gap-2 pt-1 text-sm">
                    <input type="checkbox" name="sendNow" defaultChecked className="mt-0.5 size-4 accent-primary" />
                    <span>
                      Materials leave the store now
                      <span className="block text-xs text-muted-foreground">Untick to save as a draft and send later.</span>
                    </span>
                  </label>
                </div>
              ) : null}
            </div>
            <div className="space-y-4 rounded-xl border bg-card p-4">
              <p className="text-sm font-medium">Dates & notes</p>
              <FormRow>
                <Field label="Order date" name="workDate" error={fe.workDate} required>
                  <Input id="workDate" name="workDate" type="date" defaultValue={initial?.workDate ?? date} required />
                </Field>
                <Field label="Due back on" name="dueDate" error={fe.dueDate}>
                  <Input id="dueDate" name="dueDate" type="date" defaultValue={initial?.dueDate ?? ""} />
                </Field>
              </FormRow>
              <Field label="Note" name="note" error={fe.note}>
                <Textarea id="note" name="note" rows={4} defaultValue={initial?.note ?? ""} placeholder="Instructions for the job worker" />
              </Field>
            </div>
          </div>
        );
      }}
    </ActionForm>
  );
}
