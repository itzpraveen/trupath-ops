"use client";

import { fulfilOrderInShopify } from "@/actions/shopify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormRow } from "@/components/app/field";
import { FormDialog } from "@/components/app/form-dialog";

export function FulfilDialog({ orderId, orderName, canFulfil }: { orderId: string; orderName: string; canFulfil: boolean }) {
  return (
    <FormDialog trigger={<Button variant="outline" size="sm" />} triggerLabel="Mark fulfilled in Shopify" title={`Fulfil ${orderName} in Shopify`} description={canFulfil ? "For parcels shipped without a dispatch here. Shopify marks the order fulfilled and can email the customer the tracking details." : "This store has not granted the fulfilment permission yet. Add the new scopes to the Shopify app and press Update permissions in Settings → Shopify."} action={fulfilOrderInShopify} submitLabel="Mark fulfilled">
      {(state) => {
        const fe = state?.fieldErrors ?? {};
        return (
          <>
            <input type="hidden" name="id" value={orderId} />
            <Field label="Courier" name="courier" error={fe.courier}>
              <Input id="courier" name="courier" list="couriers3" autoFocus disabled={!canFulfil} />
              <datalist id="couriers3">
                {["Delhivery", "DTDC", "Blue Dart", "India Post", "Ekart", "Xpressbees", "Shiprocket", "Professional Couriers"].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <FormRow>
              <Field label="Tracking no." name="trackingNo" error={fe.trackingNo}>
                <Input id="trackingNo" name="trackingNo" disabled={!canFulfil} />
              </Field>
              <Field label="Tracking link" name="trackingUrl" error={fe.trackingUrl}>
                <Input id="trackingUrl" name="trackingUrl" inputMode="url" disabled={!canFulfil} />
              </Field>
            </FormRow>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="notifyCustomer" defaultChecked className="size-4 accent-primary" disabled={!canFulfil} />
              Send the customer Shopify&apos;s shipping notification
            </label>
          </>
        );
      }}
    </FormDialog>
  );
}
