import "server-only";
import { after } from "next/server";

/** Fire-and-forget: after the current request finishes, push these products' stock to Shopify (if a store has stock sync on). */
export function queueStockPush(productIds: string[]) {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return;
  after(async () => {
    try {
      const { pushStockForProducts } = await import("@/lib/shopify-writeback");
      const r = await pushStockForProducts(ids);
      if (r.errors.length) console.error("[stock push]", r.errors.join(" | "));
    } catch (err) {
      console.error("[stock push]", err instanceof Error ? err.message : err);
    }
  });
}
