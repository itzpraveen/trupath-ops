"use client";

import { billJobWork, receiveJobWork, returnJobWorkMaterial, sendJobWork, setJobWorkStatus } from "@/actions/jobwork";
import type { JobWorkOrder } from "@/db/schema";
import { formatINR, toRupees } from "@/lib/money";
import { PAYMENT_METHODS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Field, FormRow } from "@/components/app/field";
import { FormDialog } from "@/components/app/form-dialog";

export function JobWorkActions({ order, sentMaterials, date }: { order: JobWorkOrder; sentMaterials: { materialId: string; name: string; unit: string; qtySent: number; qtyReturned: number }[]; date: string }) {
  const open = order.status !== "closed" && order.status !== "cancelled";
  const pending = Math.max(0, order.orderedQty - order.receivedQty - order.rejectedQty);
  const unbilled = Math.max(0, order.receivedQty - order.billedQty);
  const computedBill = Math.round(unbilled * order.ratePerUnitP * (1 + order.taxBps / 10000));
  return (
    <div className="flex flex-wrap gap-2">
      {order.status === "draft" ? (
        <ConfirmAction trigger={<Button size="sm" />} title="Send materials now?" description="The materials listed on this order are deducted from the store." action={sendJobWork} hidden={{ id: order.id }} confirmLabel="Mark sent">
          Mark sent
        </ConfirmAction>
      ) : null}
      {open && order.status !== "draft" ? (
        <FormDialog trigger={<Button size="sm" />} triggerLabel="Receive pieces" title="Receive finished pieces" description={`${order.receivedQty} of ${order.orderedQty} received so far${pending ? `, ${pending} pending` : ""}.`} action={receiveJobWork} submitLabel="Record receipt">
          {(state) => {
            const fe = state?.fieldErrors ?? {};
            return (
              <>
                <input type="hidden" name="id" value={order.id} />
                <FormRow>
                  <Field label="Accepted" name="acceptedQty" error={fe.acceptedQty} required>
                    <Input id="acceptedQty" name="acceptedQty" type="number" min={0} step={1} defaultValue={pending || ""} required autoFocus className="h-10 text-lg" />
                  </Field>
                  <Field label="Rejected" name="rejectedQty" error={fe.rejectedQty}>
                    <Input id="rejectedQty" name="rejectedQty" type="number" min={0} step={1} defaultValue={0} />
                  </Field>
                </FormRow>
                <Field label="Date" name="receiptDate" error={fe.receiptDate}>
                  <Input id="receiptDate" name="receiptDate" type="date" defaultValue={date} required />
                </Field>
                <Field label="Note" name="note" error={fe.note}>
                  <Textarea id="note" name="note" rows={2} placeholder="Quality remarks" />
                </Field>
              </>
            );
          }}
        </FormDialog>
      ) : null}
      {open && sentMaterials.length ? (
        <FormDialog trigger={<Button variant="outline" size="sm" />} triggerLabel="Return material" title="Unused material returned" action={returnJobWorkMaterial} submitLabel="Add back to store">
          {(state) => {
            const fe = state?.fieldErrors ?? {};
            return (
              <>
                <input type="hidden" name="id" value={order.id} />
                <Field label="Material" name="materialId" error={fe.materialId} required>
                  <NativeSelect id="materialId" name="materialId" required>
                    {sentMaterials.map((m) => (
                      <option key={m.materialId} value={m.materialId}>
                        {m.name} · sent {m.qtySent} {m.unit}{m.qtyReturned ? `, returned ${m.qtyReturned}` : ""}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Quantity returned" name="qty" error={fe.qty} required>
                  <Input id="qty" name="qty" type="number" step="0.001" min={0} required autoFocus />
                </Field>
                <Field label="Note" name="note" error={fe.note}>
                  <Input id="note" name="note" />
                </Field>
              </>
            );
          }}
        </FormDialog>
      ) : null}
      {order.status !== "draft" && order.status !== "cancelled" && unbilled > 0 ? (
        <FormDialog trigger={<Button variant="outline" size="sm" />} triggerLabel={order.billedQty ? "Record next bill" : "Record bill"} title="Job worker's bill" description={`${computedBill ? `${unbilled} pcs × ${formatINR(order.ratePerUnitP)}${order.taxBps ? ` + ${order.taxBps / 100}% GST` : ""} = ${formatINR(computedBill)}. ` : "No rate on the order, so enter the bill amount. "}${order.billedQty ? `${order.billedQty} pieces were billed earlier. ` : ""}Recorded as a Job work expense in the factory books.`} action={billJobWork} submitLabel="Record bill">
          {(state) => {
            const fe = state?.fieldErrors ?? {};
            return (
              <>
                <input type="hidden" name="id" value={order.id} />
                <FormRow>
                  <Field label="Bill amount (₹)" name="amountP" error={fe.amountP} hint={computedBill ? "Leave blank to use the computed amount." : undefined}>
                    <Input id="amountP" name="amountP" inputMode="decimal" defaultValue={computedBill ? toRupees(computedBill) : ""} />
                  </Field>
                  <Field label="Bill date" name="workDate" error={fe.workDate}>
                    <Input id="workDate" name="workDate" type="date" defaultValue={date} required />
                  </Field>
                </FormRow>
                <FormRow>
                  <Field label="Vendor bill no." name="reference" error={fe.reference}>
                    <Input id="reference" name="reference" />
                  </Field>
                  <Field label="Payment" name="paymentMethod" error={fe.paymentMethod}>
                    <NativeSelect id="paymentMethod" name="paymentMethod" defaultValue="credit">
                      {PAYMENT_METHODS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </FormRow>
                <Field label="Note" name="note" error={fe.note}>
                  <Input id="note" name="note" />
                </Field>
              </>
            );
          }}
        </FormDialog>
      ) : null}
      {open && order.status !== "draft" ? (
        <ConfirmAction trigger={<Button variant="ghost" size="sm" />} title="Close this order?" description="Use when nothing more is expected back." action={setJobWorkStatus} hidden={{ id: order.id, status: "closed" }} confirmLabel="Close order">
          Close
        </ConfirmAction>
      ) : null}
      {open ? (
        <ConfirmAction trigger={<Button variant="ghost" size="sm" className="text-destructive" />} title="Cancel this order?" description="Materials already sent are not returned automatically; record returns first if they came back." action={setJobWorkStatus} hidden={{ id: order.id, status: "cancelled" }} confirmLabel="Cancel order" destructive withReason>
          Cancel
        </ConfirmAction>
      ) : null}
    </div>
  );
}
