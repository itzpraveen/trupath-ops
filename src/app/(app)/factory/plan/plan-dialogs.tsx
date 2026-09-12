"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "cn";
import { createProductionPlan } from "@/actions/factory";
import type { ProductOption } from "@/lib/constants";
import { formatINR, formatQty } from "@/lib/money";
import { materialRequirement, maxMakeable, requirementCostP, type RecipeLine } from "@/lib/production-plan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormRow } from "@/components/app/field";
import { FormDialog } from "@/components/app/form-dialog";
import { ProductPicker } from "@/components/app/product-picker";

export type PlannerRecipe = { version: string; labourCostP: number; lines: RecipeLine[] };

/** Plan what to make next, with the material check in front of you before you commit. */
export function PlanDialog({ products, recipes, today }: { products: ProductOption[]; recipes: Record<string, PlannerRecipe>; today: string }) {
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const recipe = recipes[productId];
  const pieces = Math.max(0, Math.floor(Number(qty) || 0));
  const requirement = recipe ? materialRequirement(recipe.lines, pieces) : [];
  const short = requirement.filter((r) => r.short > 0);
  const canMake = recipe ? maxMakeable(recipe.lines) : 0;

  return (
    <FormDialog
      trigger={<Button size="sm" />}
      triggerLabel={
        <>
          <Plus /> Plan production
        </>
      }
      title="Plan production"
      description="Say what to make and by when. The materials are checked against the store before anything leaves it."
      action={createProductionPlan}
      submitLabel="Add to the plan"
      onOpenChange={(open) => {
        if (!open) {
          setProductId("");
          setQty("");
        }
      }}
      wide
    >
      {(state) => {
        const fe = state?.fieldErrors ?? {};
        return (
          <>
            <Field label="Product" name="productId" error={fe.productId} required>
              <ProductPicker products={products} required autoFocus onChange={(p) => setProductId(p?.id ?? "")} />
            </Field>
            <FormRow>
              <Field label="Pieces to make" name="qty" error={fe.qty} required hint={recipe ? `Materials in store cover ${canMake} ${canMake === 1 ? "piece" : "pieces"}` : undefined}>
                <Input id="qty" name="qty" type="number" inputMode="numeric" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} required className="h-10 text-lg" />
              </Field>
              <Field label="Finish by" name="targetDate" error={fe.targetDate} required>
                <Input id="targetDate" name="targetDate" type="date" defaultValue={today} required />
              </Field>
            </FormRow>

            {productId && !recipe ? (
              <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">No material recipe is in use for this product, so this plan cannot show its cost or shortages. Add one under Material recipes.</p>
            ) : null}

            {recipe && pieces > 0 ? (
              <div className="rounded-xl border bg-card">
                <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
                  <span className="font-medium">Materials for {pieces} {pieces === 1 ? "piece" : "pieces"}</span>
                  <span className={cn("text-xs", short.length ? "text-warning" : "text-success")}>{short.length ? `${short.length} short` : "Enough in store"}</span>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">Material</th>
                      <th className="px-2 py-1.5 text-right font-medium">Needed</th>
                      <th className="px-2 py-1.5 text-right font-medium">In store</th>
                      <th className="px-3 py-1.5 text-right font-medium">Short</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requirement.map((r) => (
                      <tr key={r.materialId} className="border-t">
                        <td className="px-3 py-1.5">{r.name}</td>
                        <td className="tabular px-2 py-1.5 text-right">{formatQty(r.required, r.unit)}</td>
                        <td className="tabular px-2 py-1.5 text-right text-muted-foreground">{formatQty(r.inStock)}</td>
                        <td className={cn("tabular px-3 py-1.5 text-right", r.short ? "font-semibold text-warning" : "text-muted-foreground")}>{r.short ? formatQty(r.short) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-muted/30">
                    <tr>
                      <td className="px-3 py-2 font-medium" colSpan={2}>
                        Estimated cost
                      </td>
                      <td className="tabular px-3 py-2 text-right font-semibold" colSpan={2}>
                        {formatINR(requirementCostP(requirement) + recipe.labourCostP * pieces)}
                        <span className="block text-xs font-normal text-muted-foreground">
                          materials {formatINR(requirementCostP(requirement))}
                          {recipe.labourCostP ? ` + labour ${formatINR(recipe.labourCostP * pieces)}` : ""}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : null}

            <Field label="Note" name="note" error={fe.note}>
              <Textarea id="note" name="note" rows={2} placeholder="Which order, print or size this batch is for" />
            </Field>
          </>
        );
      }}
    </FormDialog>
  );
}
