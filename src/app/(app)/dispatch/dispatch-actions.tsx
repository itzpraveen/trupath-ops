"use client";

import { setDispatchStatus } from "@/actions/dispatch";
import type { Dispatch } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Field, FormRow } from "@/components/app/field";
import { FormDialog } from "@/components/app/form-dialog";

export function DispatchActions({ dispatch }: { dispatch: Dispatch }) {
  const s = dispatch.status;
  return (
    <div className="flex flex-wrap gap-2">
      {s === "pending" ? (
        <ConfirmAction trigger={<Button variant="outline" size="sm" />} title="Mark as packed?" action={setDispatchStatus} hidden={{ id: dispatch.id, status: "packed" }} confirmLabel="Mark packed">
          Mark packed
        </ConfirmAction>
      ) : null}
      {s === "pending" || s === "packed" ? (
        <FormDialog trigger={<Button size="sm" />} triggerLabel="Mark shipped" title="Mark as shipped" description="Stock is deducted now. Add the courier details so the customer can track it." action={setDispatchStatus} submitLabel="Mark shipped">
          {(state) => {
            const fe = state?.fieldErrors ?? {};
            return (
              <>
                <input type="hidden" name="id" value={dispatch.id} />
                <input type="hidden" name="status" value="shipped" />
                <Field label="Courier" name="courier" error={fe.courier}>
                  <Input id="courier" name="courier" defaultValue={dispatch.courier ?? ""} list="couriers2" autoFocus />
                  <datalist id="couriers2">
                    {["Delhivery", "DTDC", "Blue Dart", "India Post", "Ekart", "Xpressbees", "Shiprocket", "Professional Couriers", "Own vehicle"].map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </Field>
                <FormRow>
                  <Field label="Tracking no." name="trackingNo" error={fe.trackingNo}>
                    <Input id="trackingNo" name="trackingNo" defaultValue={dispatch.trackingNo ?? ""} />
                  </Field>
                  <Field label="Tracking link" name="trackingUrl" error={fe.trackingUrl}>
                    <Input id="trackingUrl" name="trackingUrl" inputMode="url" defaultValue={dispatch.trackingUrl ?? ""} />
                  </Field>
                </FormRow>
              </>
            );
          }}
        </FormDialog>
      ) : null}
      {s === "shipped" ? (
        <ConfirmAction trigger={<Button size="sm" />} title="Mark as delivered?" action={setDispatchStatus} hidden={{ id: dispatch.id, status: "delivered" }} confirmLabel="Mark delivered">
          Mark delivered
        </ConfirmAction>
      ) : null}
      {s === "shipped" || s === "delivered" ? (
        <ConfirmAction trigger={<Button variant="outline" size="sm" />} title="Mark as returned?" description="The items go back into finished stock." action={setDispatchStatus} hidden={{ id: dispatch.id, status: "returned" }} confirmLabel="Mark returned" withReason>
          Returned
        </ConfirmAction>
      ) : null}
      {s === "packed" ? (
        <ConfirmAction trigger={<Button variant="ghost" size="sm" />} title="Move back to pending?" action={setDispatchStatus} hidden={{ id: dispatch.id, status: "pending" }} confirmLabel="Move to pending">
          Unpack
        </ConfirmAction>
      ) : null}
      {s === "pending" || s === "packed" || s === "shipped" ? (
        <ConfirmAction trigger={<Button variant="ghost" size="sm" className="text-destructive" />} title="Cancel this dispatch?" description={s === "shipped" ? "Stock that was deducted will be put back." : undefined} action={setDispatchStatus} hidden={{ id: dispatch.id, status: "cancelled" }} confirmLabel="Cancel dispatch" destructive withReason>
          Cancel
        </ConfirmAction>
      ) : null}
      {s === "cancelled" ? (
        <ConfirmAction trigger={<Button variant="outline" size="sm" />} title="Reopen this dispatch?" action={setDispatchStatus} hidden={{ id: dispatch.id, status: "pending" }} confirmLabel="Reopen">
          Reopen
        </ConfirmAction>
      ) : null}
    </div>
  );
}
