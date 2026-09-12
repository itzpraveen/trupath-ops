"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "cn";
import { createProduction } from "@/actions/factory";
import type { ProductOption } from "@/lib/constants";
import { formatQty } from "@/lib/money";
import { materialRequirement, type RecipeLine } from "@/lib/production-plan";
import type { PlanOption } from "@/lib/queries/factory";
import type { ProductionOrderOption } from "@/lib/queries/production";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormRow } from "@/components/app/field";
import { FormDialog } from "@/components/app/form-dialog";
import { ProductPicker } from "@/components/app/product-picker";

export type DialogRecipe = { lines: RecipeLine[] };

export function ProductionDialog({
  products,
  employees,
  date,
  bomProductIds,
  orders = [],
  plans = [],
  recipes = {},
}: {
  products: ProductOption[];
  employees: { id: string; name: string }[];
  date: string;
  bomProductIds: string[];
  orders?: ProductionOrderOption[];
  plans?: PlanOption[];
  recipes?: Record<string, DialogRecipe>;
}) {
  const [selection, setSelection] = useState("");
  const [freeProductId, setFreeProductId] = useState("");
  const [qty, setQty] = useState("");

  const plan = selection.startsWith("plan:") ? plans.find((p) => p.id === selection.slice(5)) : undefined;
  const order = selection.startsWith("order:") ? orders.find((o) => `order:${o.orderId}:${o.lineId}` === selection) : undefined;
  const productId = plan?.productId ?? order?.productId ?? freeProductId;
  const label = plan?.label ?? order?.label ?? "";
  const limit = plan?.remaining ?? order?.remaining;

  const pieces = Math.max(0, Math.floor(Number(qty) || 0));
  const recipe = recipes[productId];
  const short = recipe && pieces > 0 ? materialRequirement(recipe.lines, pieces).filter((r) => r.short > 0) : [];

  return (
    <FormDialog
      trigger={<Button size="sm" />}
      triggerLabel={
        <>
          <Plus /> Record production
        </>
      }
      title="Record production"
      description="Record work completed and materials used. Finished stock increases only after QC acceptance."
      action={createProduction}
      onOpenChange={(open) => {
        if (!open) {
          setSelection("");
          setFreeProductId("");
          setQty("");
        }
      }}
      submitLabel="Record production"
      wide
    >
      {(state) => {
        const fe = state?.fieldErrors ?? {};
        return (
          <>
            <Field label="Production for" name="productionFor" hint={plans.length ? undefined : "Plan a batch first to check materials before the team starts."}>
              <NativeSelect id="productionFor" value={selection} onChange={(e) => setSelection(e.target.value)}>
                <option value="">Finished stock (no plan or order)</option>
                {plans.length ? (
                  <optgroup label="Production plan">
                    {plans.map((p) => (
                      <option key={p.id} value={`plan:${p.id}`}>
                        {p.label} · {p.remaining} left
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {orders.some((o) => o.remaining > 0) ? (
                  <optgroup label="Website order">
                    {orders
                      .filter((o) => o.remaining > 0)
                      .map((o) => (
                        <option key={`${o.orderId}:${o.lineId}`} value={`order:${o.orderId}:${o.lineId}`}>
                          {o.label} · {o.remaining} to make
                        </option>
                      ))}
                  </optgroup>
                ) : null}
              </NativeSelect>
            </Field>
            <input type="hidden" name="planId" value={plan?.id ?? ""} />
            <input type="hidden" name="shopifyOrderId" value={order?.orderId ?? ""} />
            <input type="hidden" name="shopifyLineId" value={order?.lineId ?? ""} />

            <Field label="Product" name="productId" error={fe.productId} required hint={bomProductIds.length ? undefined : "Tip: add material recipes so raw materials are deducted automatically."}>
              {plan || order ? (
                <>
                  <input type="hidden" name="productId" value={productId} />
                  <p className="text-sm">{label}</p>
                </>
              ) : (
                <ProductPicker products={products} required autoFocus onChange={(p) => setFreeProductId(p?.id ?? "")} />
              )}
            </Field>
            <FormRow>
              <Field label="Quantity made" name="qty" error={fe.qty} required>
                <Input id="qty" name="qty" type="number" inputMode="numeric" min={1} max={limit} step={1} value={qty} onChange={(e) => setQty(e.target.value)} required className="h-10 text-lg" />
              </Field>
              <Field label="Date" name="workDate" error={fe.workDate} required>
                <Input id="workDate" name="workDate" type="date" defaultValue={date} required />
              </Field>
            </FormRow>

            {short.length ? (
              <p className={cn("rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning")}>
                The store is short for {pieces} {pieces === 1 ? "piece" : "pieces"}: {short.map((r) => `${r.name} ${formatQty(r.short, r.unit)}`).join(", ")}. Record the purchase or count first, or untick the recipe below and explain in the note.
              </p>
            ) : null}

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
            <Field label="Labour cost for this batch (₹)" name="labourCostP" error={fe.labourCostP} hint="Leave blank to use the recipe's labour rate for this quantity.">
              <Input id="labourCostP" name="labourCostP" inputMode="decimal" placeholder="0" />
            </Field>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="consumeMaterials" defaultChecked className="mt-0.5 size-4 accent-primary" />
              <span>
                Use up raw materials as per the product&apos;s recipe
                <span className="block text-xs text-muted-foreground">Requires an active recipe. Otherwise untick and explain how material use is recorded.</span>
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
