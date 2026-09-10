"use client";
import { inspectProduction } from "@/actions/factory";
import { FormDialog } from "@/components/app/form-dialog";
import { Field, FormRow } from "@/components/app/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function QcDialog({entry}: {entry: {id: string; number: string; qty: number; acceptedQty: number; rejectedQty: number; qcRevision: number}}) {
  const remaining = entry.qty - entry.acceptedQty - entry.rejectedQty;
  if (remaining <= 0) return null;
  return <FormDialog trigger={<Button size="sm" variant="outline" />} triggerLabel="Inspect QC" title={`QC · ${entry.number}`} description={`${remaining} units await inspection. Accepted units enter finished stock. Rejected units remain out of stock; their materials stay consumed.`} action={inspectProduction} submitLabel="Save inspection">
    <input type="hidden" name="id" value={entry.id} /><input type="hidden" name="revision" value={entry.qcRevision} />
    <FormRow>
      <Field label="Accepted quantity" name="acceptedQty" required><Input id="acceptedQty" name="acceptedQty" type="number" min={0} max={remaining} step={1} defaultValue={0} required /></Field>
      <Field label="Rejected quantity" name="rejectedQty" required><Input id="rejectedQty" name="rejectedQty" type="number" min={0} max={remaining} step={1} defaultValue={0} required /></Field>
    </FormRow>
    <Field label="Inspection note" name="note" required><Textarea id="note" name="note" required maxLength={1000} placeholder="Checks completed, defects or rework needed" /></Field>
  </FormDialog>;
}
