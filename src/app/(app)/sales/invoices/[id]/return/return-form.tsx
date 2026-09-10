"use client";
import { useState } from "react";
import type { Invoice, ShipmentReturnLine } from "@/db/schema";
import { computeCreditNote, type CreditTotals } from "@/lib/credit-note";
import { createCreditNote } from "@/actions/credit-notes";
import { ActionForm } from "@/components/app/action-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InvoiceDocument } from "@/components/app/invoice-document";
import { todayIST } from "@/lib/dates";
import { formatINR } from "@/lib/money";
export function ReturnForm({invoice,previous,requestId,physicalLines}:{invoice:Invoice;previous:CreditTotals[];requestId:string;physicalLines?:ShipmentReturnLine[]}) {
  const [quantities,setQuantities]=useState(invoice.lines.map(()=>0));
  const [stock,setStock]=useState(invoice.lines.map(()=>0));
  const [reason,setReason]=useState("");
  let totals: CreditTotals | undefined, error="";
  try { totals=computeCreditNote(invoice,previous,quantities.map((qty,originalLine)=>({originalLine,qty,restockQty:stock[originalLine]})).filter(l=>l.qty!==0 || l.restockQty!==0)); } catch(e) {error=e instanceof Error ? e.message : "Check return quantities";}
  const update=(values:number[],index:number,value:string)=>values.map((v,i)=>i===index ? Number(value) : v);
  return <ActionForm action={createCreditNote} submitLabel="Issue credit note" redirectTo={s=>`/print/credit-note/${s.id}`}>
    {state=><>
      <input type="hidden" name="invoiceId" value={invoice.id}/><input type="hidden" name="requestId" value={requestId}/><input type="hidden" name="expectedCount" value={previous.length}/>
      <p className="text-sm">{physicalLines ? "The dispatch inspection already restored saleable stock. This credit note adjusts the customer balance only. Credit quantities cannot exceed the recorded receipt." : "Record goods physically received back. Enter the quantity fit for sale separately; damaged goods do not go back into saleable stock."} Any cash or bank refund is recorded separately in Payments.</p>
      {invoice.lines.map((l,i)=>{const remaining=Math.min(l.qty, physicalLines && l.productId ? physicalLines.filter(p=>p.productId===l.productId).reduce((n,p)=>n+p.receivedQty,0) : l.qty)-previous.flatMap(p=>p.lines).filter(p=>p.originalLine===i).reduce((n,p)=>n+p.qty,0);return <div key={i} className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_8rem_8rem]"><div><p className="font-medium">{l.description}</p><p className="text-sm text-muted-foreground">{remaining} remaining · original GST {l.ratePct}%</p></div><label className="text-sm">Returned quantity<Input name="qty[]" aria-label={`Return ${l.description}`} type="number" min={0} max={remaining} step={1} value={quantities[i]} onChange={e=>setQuantities(update(quantities,i,e.target.value))}/></label><label className="text-sm">Fit for sale<Input name="restockQty[]" aria-label={`Restock ${l.description}`} readOnly={!!physicalLines} type="number" min={0} max={physicalLines ? 0 : quantities[i]} step={1} value={stock[i]} onChange={e=>setStock(update(stock,i,e.target.value))}/></label></div>})}
      <label className="block text-sm">Reason for return<Textarea name="reason" required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      {totals ? <><p className="font-semibold">Credit: {formatINR(totals.totalP)} · GST adjustment: {formatINR(totals.cgstP+totals.sgstP+totals.igstP)}</p><div className="overflow-x-auto"><div className="min-w-[640px]"><InvoiceDocument draft creditNote={{originalNumber:invoice.number,originalDate:invoice.issuedOn,reason}} inv={{...invoice,...totals,number:"DRAFT",issuedOn:todayIST(),voidedAt:null,voidReason:null}}/></div></div></> : <p className="text-sm">{error}</p>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" required name="taxAdjustmentConfirmed" className="mt-1"/>I confirm these goods were received back, the quantities and original tax are correct, and accounts has confirmed GST adjustment is eligible before the statutory deadline and filing the relevant annual return, including any required recipient ITC reversal.</label>
      {state?.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
    </>}
  </ActionForm>;
}
