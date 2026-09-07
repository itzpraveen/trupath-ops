"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "cn";
import type { ProductOption } from "@/lib/constants";

const BRAND: Record<string, string> = { babygambling: "Baby Gambling", firstbon: "Firstbon" };

export function productLabel(p: Pick<ProductOption, "name" | "variant">) {
  return p.variant ? `${p.name} — ${p.variant}` : p.name;
}

/** Searchable product selector that submits the chosen id through a hidden input. */
export function ProductPicker({
  products,
  name = "productId",
  defaultValue,
  brandId,
  required,
  onChange,
  placeholder = "Search product or SKU…",
  autoFocus,
}: {
  products: ProductOption[];
  name?: string;
  defaultValue?: string;
  brandId?: string;
  required?: boolean;
  onChange?: (p: ProductOption | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<ProductOption | null>(() => products.find((p) => p.id === defaultValue) ?? null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = brandId ? products.filter((p) => p.brandId === brandId) : products;
    if (!q) return pool.slice(0, 40);
    const terms = q.split(/\s+/);
    return pool
      .filter((p) => {
        const hay = `${p.name} ${p.variant} ${p.sku ?? ""} ${BRAND[p.brandId] ?? p.brandId}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      .slice(0, 40);
  }, [query, products, brandId]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (p: ProductOption | null) => {
    setSelected(p);
    onChange?.(p);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={wrapRef} className="relative">
      <input type="hidden" name={name} value={selected?.id ?? ""} required={required} />
      {selected ? (
        <div className="flex h-9 items-center gap-2 rounded-lg border border-input bg-accent/40 px-2.5 text-sm">
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">{productLabel(selected)}</span>
            <span className="text-muted-foreground"> · {BRAND[selected.brandId] ?? selected.brandId}{selected.sku ? ` · ${selected.sku}` : ""} · {selected.stockQty} in stock</span>
          </span>
          <button type="button" onClick={() => choose(null)} aria-label="Clear product" className="rounded p-0.5 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            autoFocus={autoFocus}
            placeholder={placeholder}
            className="h-9 w-full rounded-lg border border-input bg-transparent pl-8 pr-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, list.length - 1));
                setOpen(true);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                if (open && list[active]) {
                  e.preventDefault();
                  choose(list[active]);
                }
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
        </div>
      )}
      {open && !selected ? (
        <ul role="listbox" className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
          {list.length === 0 ? <li className="px-2.5 py-2 text-sm text-muted-foreground">No products match “{query}”.</li> : null}
          {list.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(p);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm", i === active && "bg-muted")}
            >
              <span className="min-w-0 truncate">
                {productLabel(p)}
                <span className="text-muted-foreground"> · {BRAND[p.brandId] ?? p.brandId}{p.sku ? ` · ${p.sku}` : ""}</span>
              </span>
              <span className="tabular shrink-0 text-xs text-muted-foreground">{p.stockQty}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
