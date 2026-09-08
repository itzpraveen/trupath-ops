"use client";

import { fulfilOrderInShopify } from "@/actions/shopify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormRow } from "@/components/app/field";
import { FormDialog } from "@/components/app/form-dialog";

export function FulfilDialog({ orderId, orderName, canFulfil }: { orderId: string; orderName: string; canFulfil: boolean }) {
  if (!canFulfil) {
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        <Button variant="outline" size="sm" disabled>
          Mark fulfilled in Shopify
        </Button>
        <span className="text-xs text-muted-foreground">Needs the fulfilment permission: press Update permissions in Settings → Shopify.</span>
      </span>
    );
  }
  return (
    <FormDialog trigger={<Button variant="outline" size="sm" />} triggerLabel="Mark fulfilled in Shopify" title={`Fulfil ${orderName} in Shopify`} description="For parcels shipped without a dispatch here. Shopify marks the order fulfilled and can email the customer the tracking details." action={fulfilOrderInShopify} submitLabel="Mark fulfilled">
      {(state) => {
        const fe = state?.fieldErrors ?? {};
        return (
          <>
            <input type="hidden" name="id" value={orderId} />
            <Field label="Courier" name="courier" error={fe.courier}>
              <Input id="courier" name="courier" list="couriers3" autoFocus />
              <datalist id="couriers3">
                {["Delhivery", "DTDC", "Blue Dart", "India Post", "Ekart", "Xpressbees", "Shiprocket", "Professional Couriers"].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <FormRow>
              <Field label="Tracking no." name="trackingNo" error={fe.trackingNo}>
                <Input id="trackingNo" name="trackingNo" />
              </Field>
              <Field label="Tracking link" name="trackingUrl" error={fe.trackingUrl}>
                <Input id="trackingUrl" name="trackingUrl" inputMode="url" />
              </Field>
            </FormRow>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="notifyCustomer" defaultChecked className="size-4 accent-primary" />
              Send the customer Shopify&apos;s shipping notification
            </label>
          </>
        );
      }}
    </FormDialog>
  );
}
