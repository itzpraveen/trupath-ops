"use client";

import { saveShopifyStore } from "@/actions/shopify";
import type { ShopifyStore } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FormRow } from "@/components/app/field";
import { FormDialog } from "@/components/app/form-dialog";

export function StoreDialog({ store, brands, entities, channels, hasOwnSecret }: { store?: ShopifyStore; brands: { id: string; name: string }[]; entities: { id: string; name: string }[]; channels: string[]; hasOwnSecret?: boolean }) {
  return (
    <FormDialog trigger={store ? <Button variant="outline" size="sm" /> : <Button size="sm" />} triggerLabel={store ? "Edit store" : "Add store"} title={store ? `Edit ${store.label}` : "Add a Shopify store"} description="Each store needs its own app from the Shopify Dev Dashboard. Paste that app's client ID and secret here." action={saveShopifyStore} submitLabel={store ? "Save" : "Add store"} wide>
      {(state) => {
        const fe = state?.fieldErrors ?? {};
        return (
          <>
            {store ? <input type="hidden" name="id" value={store.id} /> : null}
            <FormRow>
              <Field label="Name" name="label" error={fe.label} required>
                <Input id="label" name="label" defaultValue={store?.label ?? ""} placeholder="Firstbon website" required autoFocus={!store} />
              </Field>
              <Field label="Store domain" name="shop" error={fe.shop} required hint="The myshopify.com address, not the custom domain.">
                <Input id="shop" name="shop" defaultValue={store?.shop ?? ""} placeholder="tswyfk-qm.myshopify.com" required readOnly={!!store?.tokenEnc} />
              </Field>
            </FormRow>
            <FormRow>
              <Field label="Brand" name="brandId" error={fe.brandId}>
                <NativeSelect id="brandId" name="brandId" defaultValue={store?.brandId ?? brands[0]?.id}>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Books (where sales are recorded)" name="entityId" error={fe.entityId}>
                <NativeSelect id="entityId" name="entityId" defaultValue={store?.entityId ?? entities[0]?.id}>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </FormRow>
            <Field label="Sales channel label" name="channel" error={fe.channel}>
              <NativeSelect id="channel" name="channel" defaultValue={store?.channel ?? "Own website"}>
                {(channels.includes(store?.channel ?? "Own website") ? channels : [store?.channel ?? "Own website", ...channels]).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <FormRow>
              <Field label="Client ID" name="clientId" error={fe.clientId} hint={!store?.clientId && store ? "Blank means the server's SHOPIFY_CLIENT_ID is used." : undefined}>
                <Input id="clientId" name="clientId" defaultValue={store?.clientId ?? ""} autoComplete="off" />
              </Field>
              <Field label="Client secret" name="clientSecret" error={fe.clientSecret} hint={hasOwnSecret ? "Stored encrypted. Leave blank to keep it." : "Stored encrypted."}>
                <Input id="clientSecret" name="clientSecret" type="password" autoComplete="new-password" placeholder={hasOwnSecret ? "••••••••" : ""} />
              </Field>
            </FormRow>
            {store ? (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="active" defaultChecked={store.active} className="size-4 accent-primary" />
                  Active (synced on schedule)
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="pushInventory" defaultChecked={store.pushInventory} className="mt-0.5 size-4 accent-primary" />
                  <span>
                    Keep website stock in sync with this app
                    <span className="block text-xs text-muted-foreground">Every stock change here is pushed to Shopify as the on-hand quantity; Shopify subtracts units committed to open orders itself. Turn on only after counting stock, or the website will show everything sold out.</span>
                  </span>
                </label>
              </>
            ) : null}
          </>
        );
      }}
    </FormDialog>
  );
}
