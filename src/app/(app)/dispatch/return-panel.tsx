"use client";
import { progressShipmentReturn } from "@/actions/shipment-returns";
import type { ShipmentReturnLine, ShipmentReturnStage } from "@/db/schema";
import { FormDialog } from "@/components/app/form-dialog";
import { Field } from "@/components/app/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const labels = {requested: "Return requested", in_transit: "Return in transit", received: "Received, awaiting inspection", inspected: "Inspection complete"};
export function ReturnPanel({dispatchId, row, editable}: {dispatchId: string; row: {stage: ShipmentReturnStage; revision: number; lines: ShipmentReturnLine[]; reason: string}; editable: boolean}) {
  const next = row.stage === "requested" ? ["in_transit", "received"] as const : row.stage === "in_transit" ? ["received"] as const : row.stage === "received" ? ["inspected"] as const : [];
  const actionLabels = {in_transit: "Mark return in transit", received: "Receive returned parcel", inspected: "Inspect returned goods"};
  return <div className="space-y-3 rounded-xl border bg-card p-4 text-sm">
    <p className="font-medium">{labels[row.stage]}</p><p>{row.reason}</p>
    <ul className="space-y-2">{row.lines.map(l => <li key={l.productId}><p>{l.name}</p><p className="text-muted-foreground">{l.expectedQty} sent · {l.receivedQty} received · {l.saleableQty} saleable · {l.damagedQty} damaged{["received", "inspected"].includes(row.stage) && l.expectedQty > l.receivedQty ? ` · ${l.expectedQty - l.receivedQty} missing` : ""}</p></li>)}</ul>
    <p className="text-xs text-muted-foreground">Receipt and inspection do not post a customer credit or refund. Accounts reviews those separately. Any missing pieces remain a discrepancy for follow-up.</p>
    {editable ? <div className="flex flex-wrap gap-2">{next.map(stage => <FormDialog key={stage} trigger={<Button size="sm" variant="outline" />} triggerLabel={actionLabels[stage]} title={actionLabels[stage]} description={stage === "received" ? "Count the complete parcel on arrival. Enter zero for missing products. Keep received goods aside until inspected." : stage === "inspected" ? "Classify every received unit. Only saleable units return to finished stock. Check the counts before saving; this completes the inspection." : "Record the courier update and tracking reference."} action={progressShipmentReturn} submitLabel={stage === "inspected" ? "Complete inspection" : "Save return update"} wide>
      <input type="hidden" name="id" value={dispatchId} /><input type="hidden" name="revision" value={row.revision} /><input type="hidden" name="stage" value={stage} />
      {stage !== "in_transit" ? row.lines.map(l => <div key={l.productId} className="space-y-2 rounded-lg border p-3"><p className="text-sm font-medium">{l.name} · {stage === "received" ? `${l.expectedQty} expected` : `${l.receivedQty} received`}</p>{stage === "received" ? <Field label={`Received · ${l.name}`} name={`received:${l.productId}`} required><Input id={`received:${l.productId}`} name={`received:${l.productId}`} type="number" min={0} max={l.expectedQty} step={1} required /></Field> : <div className="grid grid-cols-2 gap-3">{["saleable", "damaged"].map(kind => <Field key={kind} label={`${kind === "saleable" ? "Saleable" : "Damaged"} · ${l.name}`} name={`${kind}:${l.productId}`} required><Input id={`${kind}:${l.productId}`} name={`${kind}:${l.productId}`} type="number" min={0} max={l.receivedQty} step={1} required /></Field>)}</div>}</div>) : null}
      <Field label="Return note" name="note" required><Textarea id="note" name="note" required maxLength={1000} placeholder="Tracking reference, parcel condition, missing goods or inspection findings" /></Field>
    </FormDialog>)}</div> : null}
  </div>;
}
