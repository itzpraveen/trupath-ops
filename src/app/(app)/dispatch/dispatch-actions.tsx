"use client";

import { startShipmentReturn } from "@/actions/shipment-returns";
import { setDispatchStatus, verifyDispatch } from "@/actions/dispatch";
import type { Dispatch } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Field, FormRow } from "@/components/app/field";
import { FormDialog } from "@/components/app/form-dialog";

export function DispatchActions({ dispatch, canFulfil, canBill }: { dispatch: Dispatch; canFulfil?: boolean; canBill: boolean }) {
  const s = dispatch.status;
  return (
    <div className="flex flex-wrap gap-2">
      {s === "pending" ? <div className="w-full space-y-2 rounded-lg border bg-card p-3 text-sm">
        <p>QC: {dispatch.qualityCheckedAt ? "verified" : "awaiting check"} · Billing: {dispatch.billingCheckedAt ? `verified · ${dispatch.billingReference}` : "awaiting accounts"}</p>
        <div className="flex flex-wrap gap-2">{(!dispatch.qualityCheckedAt ? ["quality"] : !dispatch.billingCheckedAt && canBill ? ["billing"] : []).map(check => <FormDialog key={check} trigger={<Button size="sm" variant="outline" />} triggerLabel={check === "quality" ? "Verify QC" : "Verify billing"} title={check === "quality" ? "Verify goods for packing" : "Verify billing"} description={check === "quality" ? "Confirm these pieces are QC-accepted finished goods, including any existing stock. Verify product, quantity and condition." : "Review the customer, quantities, agreed prices, payment terms and invoice. Enter the issued invoice reference, including an external invoice if accounts uses another system."} action={verifyDispatch} submitLabel={check === "quality" ? "Confirm QC" : "Confirm billing"}>
          <input type="hidden" name="id" value={dispatch.id} /><input type="hidden" name="check" value={check} />
          <Field label="Check note / billing reference" name="reference" required><Input id="reference" name="reference" required maxLength={500} /></Field>
        </FormDialog>)}</div>
      </div> : null}
      {s === "pending" && dispatch.qualityCheckedAt && dispatch.billingCheckedAt ? (
        <ConfirmAction trigger={<Button variant="outline" size="sm" />} title="Mark as packed?" action={setDispatchStatus} hidden={{ id: dispatch.id, status: "packed" }} confirmLabel="Mark packed">
          Mark packed
        </ConfirmAction>
      ) : null}
      {s === "packed" ? (
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
                {dispatch.shopifyOrderId ? (
                  <div className="space-y-2 rounded-lg bg-muted/60 p-3">
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" name="fulfilShopify" defaultChecked={canFulfil !== false} className="mt-0.5 size-4 accent-primary" />
                      <span>
                        Also mark the order fulfilled in Shopify
                        <span className="block text-xs text-muted-foreground">{canFulfil === false ? "The store has not granted the fulfilment permission yet (Settings → Shopify → Update permissions)." : "Adds the courier and tracking number to the Shopify order."}</span>
                      </span>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="notifyCustomer" defaultChecked className="size-4 accent-primary" />
                      Send the customer Shopify&apos;s shipping notification
                    </label>
                  </div>
                ) : null}
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
        <ConfirmAction trigger={<Button variant="outline" size="sm" />} title="Start return / RTO?" description="Record COD refusal or another return reason. Stock remains out until the parcel is received and inspected." action={startShipmentReturn} hidden={{ id: dispatch.id }} confirmLabel="Start return" withReason>
          Start return / RTO
        </ConfirmAction>
      ) : null}
      {s === "packed" ? (
        <ConfirmAction trigger={<Button variant="ghost" size="sm" />} title="Move back to pending?" action={setDispatchStatus} hidden={{ id: dispatch.id, status: "pending" }} confirmLabel="Move to pending">
          Unpack
        </ConfirmAction>
      ) : null}
      {s === "pending" || s === "packed" ? (
        <ConfirmAction trigger={<Button variant="ghost" size="sm" className="text-destructive" />} title="Cancel this dispatch?" action={setDispatchStatus} hidden={{ id: dispatch.id, status: "cancelled" }} confirmLabel="Cancel dispatch" destructive withReason>
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
