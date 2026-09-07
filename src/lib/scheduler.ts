import { syncShopify, isShopifyConfigured } from "@/lib/shopify";

const g = globalThis as unknown as { __trupathScheduler?: NodeJS.Timeout };

/** Periodic Shopify sync for long-running hosts (Render web service). Safe to call more than once. */
export function startScheduler(minutes: number) {
  if (g.__trupathScheduler) return;
  let warned = false;
  const run = async (trigger: string) => {
    try {
      if (!(await isShopifyConfigured())) {
        if (!warned) console.log("[scheduler] Shopify not connected yet; will retry on the next tick");
        warned = true;
        return;
      }
      const r = await syncShopify({ trigger });
      if (!r.skipped) console.log(`[scheduler] shopify sync ok: ${r.ordersUpserted} orders, ${r.productsUpserted} variants across ${r.stores} store(s)${r.errors.length ? `; errors: ${r.errors.join(" | ")}` : ""}`);
    } catch (err) {
      console.error("[scheduler] shopify sync failed:", err instanceof Error ? err.message : err);
    }
  };
  setTimeout(() => void run("startup"), 20_000).unref();
  g.__trupathScheduler = setInterval(() => void run("schedule"), Math.max(1, minutes) * 60_000);
  g.__trupathScheduler.unref();
  console.log(`[scheduler] shopify sync every ${minutes} min`);
}
