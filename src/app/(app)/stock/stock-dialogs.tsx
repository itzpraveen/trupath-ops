"use client";

import { saveProduct } from "@/actions/products";
import { stockMovement } from "@/actions/stock";
import type { Product } from "@/db/schema";
import { toRupees } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormRow } from "@/components/app/field";
import { FormDialog } from "@/components/app/form-dialog";

const KIND_META = {
  purchase_in: { title: "Stock in", description: "Finished goods received from outside (bought in or made elsewhere).", submit: "Add to stock" },
  return_in: { title: "Customer return", description: "Goods that came back and are fit to sell again.", submit: "Add to stock" },
  adjustment: { title: "Adjust stock", description: "Correct the balance up or down, for example damaged pieces.", submit: "Adjust" },
  count: { title: "Stock count", description: "Enter what you physically counted. The balance is set to this number.", submit: "Save count" },
} as const;
const TRIGGER_LABEL: Record<keyof typeof KIND_META, string> = { purchase_in: "Stock in", return_in: "Return", adjustment: "Adjust", count: "Count" };

export function StockMovementDialog({ product, kind, trigger, triggerLabel }: { product: Pick<Product, "id" | "name" | "variant" | "stockQty">; kind: keyof typeof KIND_META; trigger?: React.ReactElement; triggerLabel?: React.ReactNode }) {
  const meta = KIND_META[kind];
  return (
    <FormDialog trigger={trigger ?? <Button variant="outline" size="xs" />} triggerLabel={triggerLabel ?? TRIGGER_LABEL[kind]} title={`${meta.title}: ${product.name}${product.variant ? ` ${product.variant}` : ""}`} description={meta.description} action={stockMovement} submitLabel={meta.submit}>
      {(state) => {
        const fe = state?.fieldErrors ?? {};
        return (
          <>
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="kind" value={kind} />
            <p className="text-sm text-muted-foreground">
              Currently <span className="tabular font-medium text-foreground">{product.stockQty}</span> in stock
            </p>
            <FormRow>
              <Field label={kind === "count" ? "Counted quantity" : "Quantity"} name="qty" error={fe.qty} required>
                <Input id="qty" name="qty" type="number" inputMode="numeric" min={0} step={1} required autoFocus className="h-10 text-lg" />
              </Field>
              {kind === "adjustment" ? (
                <Field label="Direction" name="direction" error={fe.direction}>
                  <NativeSelect id="direction" name="direction" defaultValue="add">
                    <option value="add">Add to stock</option>
                    <option value="remove">Remove from stock</option>
                  </NativeSelect>
                </Field>
              ) : (
                <Field label="Reference" name="reference" error={fe.reference}>
                  <Input id="reference" name="reference" placeholder={kind === "return_in" ? "Order / invoice no." : "Bill or note"} />
                </Field>
              )}
            </FormRow>
            <Field label="Note" name="note" error={fe.note}>
              <Textarea id="note" name="note" rows={2} />
            </Field>
          </>
        );
      }}
    </FormDialog>
  );
}

export function ProductDialog({ product, brands, categories, trigger }: { product?: Product; brands: { id: string; name: string }[]; categories: string[]; trigger?: React.ReactElement }) {
  const cats = product?.category && !categories.includes(product.category) ? [product.category, ...categories] : categories;
  return (
    <FormDialog trigger={trigger ?? (product ? <Button variant="ghost" size="xs" /> : <Button size="sm" />)} triggerLabel={product ? "Edit" : "Add product"} title={product ? `Edit ${product.name}` : "Add product"} description={product?.source === "shopify" ? "Name, variant, SKU and price come from Shopify and are refreshed on each sync. Cost and minimum stock are yours." : undefined} action={saveProduct} submitLabel={product ? "Save changes" : "Add product"} wide>
      {(state) => {
        const fe = state?.fieldErrors ?? {};
        const synced = product?.source === "shopify";
        return (
          <>
            {product ? <input type="hidden" name="id" value={product.id} /> : null}
            <FormRow>
              <Field label="Brand" name="brandId" error={fe.brandId} required>
                <NativeSelect id="brandId" name="brandId" defaultValue={product?.brandId ?? brands[0]?.id} disabled={synced}>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </NativeSelect>
                {synced ? <input type="hidden" name="brandId" value={product.brandId} /> : null}
              </Field>
              <Field label="Category" name="category" error={fe.category}>
                <Input id="category" name="category" list="product-categories" defaultValue={product?.category ?? ""} readOnly={synced} />
                <datalist id="product-categories">
                  {cats.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
            </FormRow>
            <FormRow>
              <Field label="Product name" name="name" error={fe.name} required>
                <Input id="name" name="name" defaultValue={product?.name ?? ""} required readOnly={synced} autoFocus={!product} />
              </Field>
              <Field label="Variant / size / print" name="variant" error={fe.variant}>
                <Input id="variant" name="variant" defaultValue={product?.variant ?? ""} readOnly={synced} placeholder="e.g. 0-6 months, Sleepy Bear" />
              </Field>
            </FormRow>
            <FormRow>
              <Field label="SKU" name="sku" error={fe.sku}>
                <Input id="sku" name="sku" defaultValue={product?.sku ?? ""} readOnly={synced} />
              </Field>
              <Field label="Selling price (₹)" name="priceP" error={fe.priceP}>
                <Input id="priceP" name="priceP" inputMode="decimal" defaultValue={product?.priceP ? toRupees(product.priceP) : ""} readOnly={synced} />
              </Field>
            </FormRow>
            <FormRow>
              <Field label="Cost per piece (₹)" name="costP" error={fe.costP} hint="Used for stock value and margins.">
                <Input id="costP" name="costP" inputMode="decimal" defaultValue={product?.costP ? toRupees(product.costP) : ""} />
              </Field>
              <Field label="Minimum stock" name="minStock" error={fe.minStock} hint="Alert when stock falls to this level.">
                <Input id="minStock" name="minStock" type="number" min={0} step={1} defaultValue={product?.minStock || ""} />
              </Field>
            </FormRow>
            {!product ? (
              <Field label="Opening stock" name="openingQty" error={fe.openingQty}>
                <Input id="openingQty" name="openingQty" type="number" min={0} step={1} />
              </Field>
            ) : (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={product.active} className="size-4 accent-primary" />
                Active (shown in pickers and stock lists)
              </label>
            )}
          </>
        );
      }}
    </FormDialog>
  );
}
