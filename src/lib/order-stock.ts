import type { ShopifyLine } from "@/db/schema";

/**
 * What a website order does to finished stock. Pure, so it is unit-tested without a database.
 *
 * Each order line remembers how many units already left stock (`deductedQty`). Units are deducted as
 * Shopify reports them fulfilled, so split shipments deduct in parts, and a cancelled or restocked order
 * puts back exactly what went out. Stock is only ever put back through those paths (or a dispatch return
 * in this app), never because Shopify later reports fewer fulfilled units.
 */
export type StockMove = { variantId: string; qty: number; title: string };
export type OrderStockPlan = { lines: ShopifyLine[]; moves: StockMove[]; stockDeducted: boolean; stockRestored: boolean };

/** Fill in `deductedQty` for lines stored before per-line tracking existed (the order-level flags said it all went out). */
export function withDeducted(lines: ShopifyLine[], stockDeducted: boolean, stockRestored: boolean): ShopifyLine[] {
  const legacy = stockDeducted && !stockRestored;
  return lines.map((l) => ({ ...l, deductedQty: l.deductedQty ?? (legacy ? l.quantity : 0) }));
}

export function planOrderStock(input: {
  /** Fresh lines from Shopify, with `fulfilledQty`. */
  lines: ShopifyLine[];
  /** Lines as stored from the previous sync, carrying `deductedQty`. */
  previous: ShopifyLine[] | null;
  fulfillmentStatus: string | null;
  cancelled: boolean;
  /** False for orders placed before the stock baseline (the moment the store was connected). */
  touchesStock: boolean;
  stockDeducted: boolean;
  stockRestored: boolean;
  localReturns?: boolean;
}): OrderStockPlan {
  const prev = new Map(withDeducted(input.previous ?? [], input.stockDeducted, input.stockRestored).map((l) => [l.id, l]));
  const lines: ShopifyLine[] = input.lines.map((l) => ({ ...l, deductedQty: prev.get(l.id)?.deductedQty ?? 0 }));
  const moves: StockMove[] = [];
  let { stockDeducted, stockRestored } = input;
  const restock = input.cancelled || input.fulfillmentStatus === "RESTOCKED";
  if (restock) {
    if (!input.localReturns && stockDeducted && !stockRestored) {
      for (const l of lines) {
        const q = l.deductedQty ?? 0;
        if (l.variantId && q > 0) moves.push({ variantId: l.variantId, qty: q, title: l.title });
        l.deductedQty = 0;
      }
      stockRestored = true;
    }
  } else if (input.touchesStock && !stockRestored) {
    for (const l of lines) {
      if (!l.variantId) continue;
      const fulfilled = l.fulfilledQty ?? (input.fulfillmentStatus === "FULFILLED" ? l.quantity : 0);
      const delta = fulfilled - (l.deductedQty ?? 0);
      if (delta > 0) {
        moves.push({ variantId: l.variantId, qty: -delta, title: l.title });
        l.deductedQty = (l.deductedQty ?? 0) + delta;
        stockDeducted = true;
      }
    }
  }
  return { lines, moves, stockDeducted, stockRestored };
}

/** The order line a dispatched product belongs to (prefers a line that still has units unaccounted for). */
export function lineForVariant(lines: ShopifyLine[], variantId: string | null | undefined): ShopifyLine | undefined {
  if (!variantId) return undefined;
  const matches = lines.filter((l) => l.variantId === variantId);
  return matches.find((l) => (l.deductedQty ?? 0) < l.quantity) ?? matches[0];
}
