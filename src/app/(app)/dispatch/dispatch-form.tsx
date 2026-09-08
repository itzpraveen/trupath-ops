"use client";

import { useState } from "react";
import { Plus, Trash } from "lucide-react";
import { createDispatch, updateDispatch } from "@/actions/dispatch";
import type { Dispatch } from "@/db/schema";
import { toRupees } from "@/lib/money";
import { PAYMENT_METHODS, type ProductOption } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ActionForm } from "@/components/app/action-form";
import { Field, FormRow } from "@/components/app/field";
import { ProductPicker } from "@/components/app/product-picker";

type Line = { key: number; productId: string; qty: string; unitPrice: string };

export function DispatchForm({
  products,
  brands,
  entities,
  channels,
  customers,
  date,
  initial,
  itemsLocked,
  salesMode = false,
}: {
  products: ProductOption[];
  brands: { id: string; name: string }[];
  entities: { id: string; name: string }[];
  channels: string[];
  customers: { id: string; name: string; address?: string | null; phone?: string | null }[];
  date: string;
  initial?: Dispatch & { items: { productId: string; qty: number; unitPriceP?: number | null }[] };
  itemsLocked?: boolean;
  salesMode?: boolean;
}) {
  const [lines, setLines] = useState<Line[]>(() => (initial?.items.length ? initial.items.map((it, i) => ({ key: i, productId: it.productId, qty: String(it.qty), unitPrice: it.unitPriceP == null ? "" : toRupees(it.unitPriceP) })) : [{ key: 0, productId: "", qty: "1", unitPrice: "" }]));
  const [recordSale, setRecordSale] = useState(salesMode);
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const [customerName, setCustomerName] = useState(initial?.customerName ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const priced = lines.some((l) => l.unitPrice !== "");
  const totalPrice = lines.reduce((sum, l) => sum + Math.round(Number(l.unitPrice || 0) * 100) * Number(l.qty || 0), 0);
  const totalPcs = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);

  return (
    <ActionForm action={initial ? updateDispatch : createDispatch} submitLabel={initial ? "Save changes" : salesMode ? "Save sale and review invoice" : "Create dispatch"} redirectTo={(s) => (initial ? `/dispatch/${initial.id}` : salesMode ? `/print/invoice/preview?source=dispatch&id=${s.id}` : `/dispatch/${s.id}`)}>
      {(state) => {
        const fe = state?.fieldErrors ?? {};
        return (
          <>
            {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
            <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="space-y-4">
                <div className="space-y-2 rounded-xl border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Items {totalPcs ? <span className="text-muted-foreground">· {totalPcs} pcs</span> : null}</p>
                    {!itemsLocked ? (
                      <Button type="button" variant="outline" size="xs" onClick={() => setLines((ls) => [...ls, { key: Date.now(), productId: "", qty: "1", unitPrice: "" }])}>
                        <Plus /> Add item
                      </Button>
                    ) : null}
                  </div>
                  {itemsLocked ? <p className="text-xs text-muted-foreground">Items are locked because stock has already been deducted for this dispatch.</p> : null}
                  <div className="grid grid-cols-[minmax(0,1fr)_4rem_6rem_2rem] gap-2 text-xs text-muted-foreground"><span>Product</span><span>Qty</span><span>Unit price (₹, incl. GST)</span></div>
                  <div className="space-y-2">
                    {lines.map((l) => (
                      <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_4rem_6rem_2rem] items-start gap-2">
                        {itemsLocked ? (
                          <>
                            <input type="hidden" name="productId[]" value={l.productId} />
                            <p className="truncate pt-2 text-sm">{(() => { const p = products.find((x) => x.id === l.productId); return p ? `${p.name}${p.variant ? ` — ${p.variant}` : ""}` : "Product"; })()}</p>
                          </>
                        ) : (
                          <ProductPicker products={products} name="productId[]" defaultValue={l.productId} onChange={(p) => update(l.key, { productId: p?.id ?? "", ...(salesMode ? { unitPrice: p ? toRupees(p.priceP) : "" } : {}) })} required />
                        )}
                        <Input name="qty[]" type="number" min={1} step={1} value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} required readOnly={itemsLocked} aria-label="Quantity" />
                        <Input name="unitPrice[]" aria-label="Unit price including GST" inputMode="decimal" placeholder="Price incl. GST" value={l.unitPrice} onChange={(e) => update(l.key, { unitPrice: e.target.value })} readOnly={itemsLocked} required={salesMode || priced} />
                        {!itemsLocked ? (
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}>
                            <Trash />
                          </Button>
                        ) : (
                          <span />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border bg-card p-4">
                  <p className="text-sm font-medium">Deliver to</p>
                  <FormRow>
                    <Field label="Customer name" name="customerName" error={fe.customerName} required>
                      <Input id="customerName" name="customerName" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required list="dispatch-customers" />
                      <datalist id="dispatch-customers">
                        {customers.map((c) => (
                          <option key={c.id} value={c.name} />
                        ))}
                      </datalist>
                    </Field>
                    <Field label="Phone" name="phone" error={fe.phone}>
                      <Input id="phone" name="phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </Field>
                  </FormRow>
                  <Field label="Address" name="address" error={fe.address}>
                    <Textarea id="address" name="address" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} />
                  </Field>
                  <Field label="Saved customer (for statements)" name="contactId" error={fe.contactId}>
                    <NativeSelect id="contactId" name="contactId" defaultValue={initial?.contactId ?? ""} required={salesMode} onChange={(e) => { const c = customers.find((c) => c.id === e.target.value); if (c) { setCustomerName(c.name); setAddress(c.address ?? ""); setPhone(c.phone ?? ""); } }}>
                      <option value="">Not linked</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-4 rounded-xl border bg-card p-4">
                  <p className="text-sm font-medium">Details</p>
                  <FormRow>
                    <Field label="Brand" name="brandId" error={fe.brandId} required>
                      <NativeSelect id="brandId" name="brandId" defaultValue={initial?.brandId ?? brands[0]?.id}>
                        {brands.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label="Books" name="entityId" error={fe.entityId}>
                      <NativeSelect id="entityId" name="entityId" defaultValue={initial?.entityId ?? "brand"}>
                        {entities.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                  </FormRow>
                  <FormRow>
                    <Field label="Date" name="dispatchDate" error={fe.dispatchDate} required>
                      <Input id="dispatchDate" name="dispatchDate" type="date" defaultValue={initial?.dispatchDate ?? date} required />
                    </Field>
                    <Field label="Order / invoice ref" name="orderRef" error={fe.orderRef}>
                      <Input id="orderRef" name="orderRef" defaultValue={initial?.orderRef ?? ""} />
                    </Field>
                  </FormRow>
                  <Field label="Order value (₹)" name="amountP" error={fe.amountP}>
                    {priced ? <Input key="calculated-total" id="amountP" name="amountP" value={toRupees(totalPrice)} readOnly /> : <Input key="manual-total" id="amountP" name="amountP" inputMode="decimal" defaultValue={initial?.amountP ? toRupees(initial.amountP) : ""} />}
                    <p className="text-xs text-muted-foreground">For a tax invoice, enter each agreed unit price including GST. Any discount must be included in that selling price.</p>
                  </Field>
                  {!initial ? (
                    <>
                      <label className="flex items-start gap-2 text-sm">
                        <input type="checkbox" name="recordSale" checked={recordSale} onChange={(e) => setRecordSale(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
                        <span>
                          Record the order value as a sale in the books
                          <span className="block text-xs text-muted-foreground">Skip for website orders, which are already counted.</span>
                        </span>
                      </label>
                      {recordSale ? (
                        <FormRow>
                          <Field label="Channel" name="channel" error={fe.channel}>
                            <NativeSelect id="channel" name="channel" defaultValue="Wholesale / B2B">
                              {channels.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </NativeSelect>
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
                      ) : null}
                    </>
                  ) : null}
                </div>
                <div className="space-y-4 rounded-xl border bg-card p-4">
                  <p className="text-sm font-medium">Courier (can be added later)</p>
                  <Field label="Courier" name="courier" error={fe.courier}>
                    <Input id="courier" name="courier" defaultValue={initial?.courier ?? ""} list="couriers" />
                    <datalist id="couriers">
                      {["Delhivery", "DTDC", "Blue Dart", "India Post", "Ekart", "Xpressbees", "Shiprocket", "Professional Couriers", "Own vehicle"].map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </Field>
                  <FormRow>
                    <Field label="Tracking no." name="trackingNo" error={fe.trackingNo}>
                      <Input id="trackingNo" name="trackingNo" defaultValue={initial?.trackingNo ?? ""} />
                    </Field>
                    <Field label="Tracking link" name="trackingUrl" error={fe.trackingUrl}>
                      <Input id="trackingUrl" name="trackingUrl" inputMode="url" defaultValue={initial?.trackingUrl ?? ""} />
                    </Field>
                  </FormRow>
                  <Field label="Note" name="note" error={fe.note}>
                    <Textarea id="note" name="note" rows={2} defaultValue={initial?.note ?? ""} />
                  </Field>
                </div>
              </div>
            </div>
          </>
        );
      }}
    </ActionForm>
  );
}
