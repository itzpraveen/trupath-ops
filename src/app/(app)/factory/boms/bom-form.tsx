"use client";

import { useMemo, useState } from "react";
import { Plus, Trash } from "lucide-react";
import { saveBom } from "@/actions/materials";
import type { Material } from "@/db/schema";
import { formatINR, toRupees } from "@/lib/money";
import type { ProductOption } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ActionForm } from "@/components/app/action-form";
import { Field, FormRow } from "@/components/app/field";
import { ProductPicker } from "@/components/app/product-picker";

type Line = { key: number; materialId: string; qtyPerUnit: string; wastagePct: string };

export function BomForm({
  products,
  materials,
  initial,
}: {
  products: ProductOption[];
  materials: Pick<Material, "id" | "code" | "name" | "unit" | "costP" | "qty">[];
  initial?: { id: string; productId: string; version: string; labourCostP: number; note: string | null; lines: { materialId: string; qtyPerUnit: number; wastagePct: number }[] };
}) {
  const [lines, setLines] = useState<Line[]>(() =>
    initial?.lines.length
      ? initial.lines.map((l, i) => ({ key: i, materialId: l.materialId, qtyPerUnit: String(l.qtyPerUnit), wastagePct: String(l.wastagePct || "") }))
      : [{ key: 0, materialId: "", qtyPerUnit: "", wastagePct: "" }],
  );
  const [labour, setLabour] = useState(initial ? toRupees(initial.labourCostP) : "");
  const matMap = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const materialCost = lines.reduce((s, l) => {
    const m = matMap.get(l.materialId);
    const q = Number(l.qtyPerUnit) || 0;
    const w = 1 + (Number(l.wastagePct) || 0) / 100;
    return m ? s + q * w * m.costP : s;
  }, 0);
  const labourP = Math.round((Number(labour.replace(/[₹,\s]/g, "")) || 0) * 100);

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <ActionForm action={saveBom} submitLabel={initial ? "Save recipe" : "Create recipe"} redirectTo="/factory/boms">
      {(state) => {
        const fe = state?.fieldErrors ?? {};
        return (
          <>
            {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
            <Field label="Product" name="productId" error={fe.productId} required>
              <ProductPicker products={products} defaultValue={initial?.productId} required />
            </Field>
            <FormRow>
              <Field label="Version" name="version" error={fe.version}>
                <Input id="version" name="version" defaultValue={initial?.version ?? "V1"} />
              </Field>
              <Field label="Labour cost per unit (₹)" name="labourCostP" error={fe.labourCostP} hint="Optional. Stitching charge per finished piece.">
                <Input id="labourCostP" name="labourCostP" inputMode="decimal" value={labour} onChange={(e) => setLabour(e.target.value)} />
              </Field>
            </FormRow>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Materials per finished unit</p>
                <Button type="button" variant="outline" size="xs" onClick={() => setLines((ls) => [...ls, { key: Date.now(), materialId: "", qtyPerUnit: "", wastagePct: "" }])}>
                  <Plus /> Add material
                </Button>
              </div>
              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Material</th>
                      <th className="w-32 px-2 py-2 text-left font-medium">Qty / unit</th>
                      <th className="w-24 px-2 py-2 text-left font-medium">Wastage %</th>
                      <th className="w-28 px-2 py-2 text-right font-medium">Cost</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const m = matMap.get(l.materialId);
                      const cost = m ? (Number(l.qtyPerUnit) || 0) * (1 + (Number(l.wastagePct) || 0) / 100) * m.costP : 0;
                      return (
                        <tr key={l.key} className="border-t">
                          <td className="px-2 py-1.5">
                            <NativeSelect name="materialId[]" value={l.materialId} onChange={(e) => update(l.key, { materialId: e.target.value })} required>
                              <option value="">Choose material…</option>
                              {materials.map((mm) => (
                                <option key={mm.id} value={mm.id}>
                                  {mm.name} ({mm.unit})
                                </option>
                              ))}
                            </NativeSelect>
                          </td>
                          <td className="px-2 py-1.5">
                            <Input name="qtyPerUnit[]" type="number" step="0.001" min={0} value={l.qtyPerUnit} onChange={(e) => update(l.key, { qtyPerUnit: e.target.value })} placeholder={m ? m.unit : ""} required />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input name="wastagePct[]" type="number" step="0.5" min={0} value={l.wastagePct} onChange={(e) => update(l.key, { wastagePct: e.target.value })} placeholder="0" />
                          </td>
                          <td className="tabular px-2 py-1.5 text-right text-muted-foreground">{m ? formatINR(Math.round(cost), { exact: true }) : "—"}</td>
                          <td className="px-1 py-1.5 text-right">
                            <Button type="button" variant="ghost" size="icon-xs" aria-label="Remove line" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}>
                              <Trash />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t bg-muted/30 text-sm">
                    <tr>
                      <td className="px-3 py-2 font-medium" colSpan={3}>
                        Estimated cost per unit
                      </td>
                      <td className="tabular px-2 py-2 text-right font-semibold" colSpan={2}>
                        {formatINR(Math.round(materialCost) + labourP)}
                        <span className="block text-xs font-normal text-muted-foreground">materials {formatINR(Math.round(materialCost))}{labourP ? ` + labour ${formatINR(labourP)}` : ""}</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <Field label="Note" name="note" error={fe.note}>
              <Textarea id="note" name="note" rows={2} defaultValue={initial?.note ?? ""} placeholder="Cutting notes, sizes, anything the team should know" />
            </Field>
          </>
        );
      }}
    </ActionForm>
  );
}
