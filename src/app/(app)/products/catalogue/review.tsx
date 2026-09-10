"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { applySuppliedCatalogue } from "@/actions/product-catalogue";
import { suggestCatalogueProducts, type CatalogueEntry } from "@/lib/product-catalogue";
import type { ProductOption } from "@/lib/constants";
import { formatINR } from "@/lib/money";
import { ProductPicker, productLabel } from "@/components/app/product-picker";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type ReviewProduct = ProductOption & { costP: number; hsnCode: string | null; gstRate: number | null; catalogueRef: string | null; requiresComponentBilling: boolean; revision: string };
const money = (amount: number | null) => amount === null ? "Not supplied" : formatINR(amount);

export function CatalogueReview({ entries, brandId, products, editable }: { entries: CatalogueEntry[]; brandId: string; products: ReviewProduct[]; editable: boolean }) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Record<string, string>>(() => Object.fromEntries(entries.flatMap((entry) => {
    const matches = suggestCatalogueProducts(entry, products);
    return matches.length === 1 ? [[entry.ref, matches[0].id]] : [];
  })));
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [state, formAction] = useActionState(async (previous: Parameters<typeof applySuppliedCatalogue>[0], form: FormData) => {
    const result = await applySuppliedCatalogue(previous, form);
    if (result?.ok) { toast.success(result.message); setSelected({}); }
    return result;
  }, null);
  const mappings = entries.flatMap((entry) => {
    const product = products.find((item) => item.id === chosen[entry.ref]);
    return selected[entry.ref] && product ? [{ ref: entry.ref, productId: product.id, revision: product.revision }] : [];
  });
  const matchedCount = Object.values(chosen).filter(Boolean).length;
  const visible = entries.filter((entry) => `${entry.name} ${entry.category} ${entry.hsnCode}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <form action={formAction} className="space-y-4">
    <input type="hidden" name="brandId" value={brandId} />
    <input type="hidden" name="mappings" value={JSON.stringify(mappings)} />
    <div className="rounded-lg border p-4 text-sm">
      <p>Review each match before applying it. HSN and supplied GST rates are saved against the selected products. Names, SKUs, Shopify selling prices and stock quantities are preserved.</p>
      <p className="mt-2 text-muted-foreground">Complete feeding pillows need cover/inner selling amounts before component invoices can be issued. Shopify tax differences are shown as invoice errors for accounts to reconcile.</p>
      {editable ? <div className="mt-3 space-y-2">
        <label className="flex items-start gap-2"><input type="checkbox" name="applyCosts" className="mt-0.5 size-4 accent-primary" />Update product costs from supplied purchase prices, using these amounts for stock valuation.</label>
        <label className="flex items-start gap-2"><input type="checkbox" name="applyManualPrices" className="mt-0.5 size-4 accent-primary" />Update manual product selling prices; these supplied amounts include GST.</label>
      </div> : null}
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <Input aria-label="Search supplied catalogue" placeholder="Search supplied products…" value={query} onChange={(event) => setQuery(event.target.value)} className="max-w-sm" />
      <span className="text-sm text-muted-foreground">{matchedCount} matched or suggested · {mappings.length} selected</span>
      {editable ? <Button type="button" size="sm" variant="outline" onClick={() => setSelected((previous) => ({ ...previous, ...Object.fromEntries(visible.filter((entry) => !!chosen[entry.ref]).map((entry) => [entry.ref, true])) }))}>Select visible matches</Button> : null}
    </div>
    <div className="divide-y rounded-lg border px-4">
      {visible.map((entry) => {
        const product = products.find((item) => item.id === chosen[entry.ref]);
        const suggestions = suggestCatalogueProducts(entry, products);
        return <div key={entry.ref} id={`catalogue-${entry.ref}`} data-testid={`catalogue-${entry.ref}`} className="grid scroll-mt-4 gap-3 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
          <div className="min-w-0">
            <p className="text-sm font-medium">{entry.name}</p>
            <p className="text-xs text-muted-foreground">{entry.category} · Source row {entry.row}</p>
            <p className="mt-1 text-sm">HSN {entry.hsnCode} · {entry.gstRate === null ? "GST not supplied" : `${entry.gstRate}% GST`}</p>
            <p className="mt-1 text-xs text-muted-foreground">Purchase {money(entry.purchasePriceP)} · Sale {money(entry.salePriceP)}</p>
            {entry.requiresComponentBilling ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Cover 5% + inner 18% · selling amounts needed</p> : null}
          </div>
          <div className="min-w-0 space-y-2">
            {editable ? <ProductPicker key={`${entry.ref}:${chosen[entry.ref] ?? ""}`} products={products.filter((item) => !item.catalogueRef || item.catalogueRef === entry.ref)} name={`match-${entry.ref}`} defaultValue={chosen[entry.ref]} brandId={brandId}
              placeholder={`Match ${entry.name}`} onChange={(item) => { setChosen((previous) => ({ ...previous, [entry.ref]: item?.id ?? "" })); setSelected((previous) => ({ ...previous, [entry.ref]: false })); }} />
              : <p className="text-sm">{product ? productLabel(product) : "Not matched"}</p>}
            {product ? <p className="text-xs text-muted-foreground">{product.catalogueRef === entry.ref ? "Linked" : "Suggested match — review before applying"}. Current HSN {product.hsnCode || "missing"}; GST {product.gstRate === null ? "missing" : `${product.gstRate}%`}. Current selling price {money(product.priceP)}; cost {money(product.costP)}.</p>
              : <p className="text-xs text-muted-foreground">{suggestions.length > 1 ? "Several products match this name. Choose the correct variant." : "Choose an existing product. If it is sold online, refresh Shopify first."}</p>}
          </div>
          {editable ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" aria-label={`Apply ${entry.name}`} checked={!!selected[entry.ref]} disabled={!product} onChange={(event) => setSelected((previous) => ({ ...previous, [entry.ref]: event.target.checked }))} className="mt-0.5 size-4 accent-primary" />Apply</label> : null}
        </div>;
      })}
      {!visible.length ? <p className="py-6 text-sm">No supplied products match this search.</p> : null}
    </div>
    {state?.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
    {state?.ok ? <p role="status" className="text-sm">{state.message}</p> : null}
    {editable ? <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{mappings.length} products selected across all search results.</p><SubmitButton disabled={!mappings.length} pendingLabel="Applying…">Apply reviewed matches</SubmitButton></div> : null}
  </form>;
}
