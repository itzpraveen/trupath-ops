import { describe, expect, it } from "vitest";
import type { ShopifyLine } from "@/db/schema";
import { lineForVariant, planOrderStock, withDeducted } from "@/lib/order-stock";

const line = (over: Partial<ShopifyLine> = {}): ShopifyLine => ({ id: "l1", title: "Nest bed", variantTitle: null, sku: null, variantId: "v1", productId: "p1", quantity: 2, priceP: 100000, discountP: 0, fulfilledQty: 0, ...over });
const base = { previous: null, fulfillmentStatus: "UNFULFILLED", cancelled: false, touchesStock: true, stockDeducted: false, stockRestored: false };

describe("planOrderStock", () => {
  it("does nothing for an unfulfilled order", () => {
    const plan = planOrderStock({ ...base, lines: [line()] });
    expect(plan.moves).toEqual([]);
    expect(plan.stockDeducted).toBe(false);
    expect(plan.lines[0].deductedQty).toBe(0);
  });

  it("deducts fulfilled units once", () => {
    const first = planOrderStock({ ...base, lines: [line({ fulfilledQty: 2 })], fulfillmentStatus: "FULFILLED" });
    expect(first.moves).toEqual([{ variantId: "v1", qty: -2, title: "Nest bed" }]);
    expect(first.stockDeducted).toBe(true);
    expect(first.lines[0].deductedQty).toBe(2);
    const again = planOrderStock({ ...base, lines: [line({ fulfilledQty: 2 })], fulfillmentStatus: "FULFILLED", previous: first.lines, stockDeducted: true });
    expect(again.moves).toEqual([]);
    expect(again.lines[0].deductedQty).toBe(2);
  });

  it("deducts split shipments in parts", () => {
    const part = planOrderStock({ ...base, lines: [line({ fulfilledQty: 1 })], fulfillmentStatus: "PARTIALLY_FULFILLED" });
    expect(part.moves).toEqual([{ variantId: "v1", qty: -1, title: "Nest bed" }]);
    const rest = planOrderStock({ ...base, lines: [line({ fulfilledQty: 2 })], fulfillmentStatus: "FULFILLED", previous: part.lines, stockDeducted: true });
    expect(rest.moves).toEqual([{ variantId: "v1", qty: -1, title: "Nest bed" }]);
    expect(rest.lines[0].deductedQty).toBe(2);
  });

  it("never touches stock for orders placed before the baseline", () => {
    const plan = planOrderStock({ ...base, lines: [line({ fulfilledQty: 2 })], fulfillmentStatus: "FULFILLED", touchesStock: false });
    expect(plan.moves).toEqual([]);
    expect(plan.stockDeducted).toBe(false);
  });

  it("does not put stock back just because Shopify reports fewer fulfilled units", () => {
    const previous = [line({ fulfilledQty: 2, deductedQty: 2 })];
    const plan = planOrderStock({ ...base, lines: [line({ fulfilledQty: 1 })], fulfillmentStatus: "PARTIALLY_FULFILLED", previous, stockDeducted: true });
    expect(plan.moves).toEqual([]);
    expect(plan.lines[0].deductedQty).toBe(2);
  });

  it("puts back exactly what went out when the order is cancelled", () => {
    const previous = [line({ fulfilledQty: 1, deductedQty: 1 }), line({ id: "l2", variantId: "v2", quantity: 3, fulfilledQty: 0, deductedQty: 0 })];
    const plan = planOrderStock({ ...base, lines: [line({ fulfilledQty: 1 }), line({ id: "l2", variantId: "v2", quantity: 3 })], previous, cancelled: true, stockDeducted: true });
    expect(plan.moves).toEqual([{ variantId: "v1", qty: 1, title: "Nest bed" }]);
    expect(plan.stockRestored).toBe(true);
    expect(plan.lines.map((l) => l.deductedQty)).toEqual([0, 0]);
    const again = planOrderStock({ ...base, lines: plan.lines, previous: plan.lines, cancelled: true, stockDeducted: true, stockRestored: true });
    expect(again.moves).toEqual([]);
  });

  it("restocked orders are treated like cancelled ones", () => {
    const previous = [line({ deductedQty: 2 })];
    const plan = planOrderStock({ ...base, lines: [line({ fulfilledQty: 2 })], fulfillmentStatus: "RESTOCKED", previous, stockDeducted: true });
    expect(plan.moves).toEqual([{ variantId: "v1", qty: 2, title: "Nest bed" }]);
  });

  it("treats rows stored before per-line tracking as fully deducted", () => {
    const previous = [line()]; // no deductedQty on the stored line
    delete previous[0].deductedQty;
    const same = planOrderStock({ ...base, lines: [line({ fulfilledQty: 2 })], fulfillmentStatus: "FULFILLED", previous, stockDeducted: true });
    expect(same.moves).toEqual([]);
    const cancelled = planOrderStock({ ...base, lines: [line({ fulfilledQty: 2 })], previous, cancelled: true, stockDeducted: true });
    expect(cancelled.moves).toEqual([{ variantId: "v1", qty: 2, title: "Nest bed" }]);
  });

  it("does not deduct again after stock was put back", () => {
    const plan = planOrderStock({ ...base, lines: [line({ fulfilledQty: 2 })], fulfillmentStatus: "FULFILLED", previous: [line({ deductedQty: 0 })], stockDeducted: true, stockRestored: true });
    expect(plan.moves).toEqual([]);
  });

  it("skips lines that are not linked to a variant", () => {
    const plan = planOrderStock({ ...base, lines: [line({ variantId: null, fulfilledQty: 2 })], fulfillmentStatus: "FULFILLED" });
    expect(plan.moves).toEqual([]);
  });
});

describe("withDeducted", () => {
  it("fills in the whole quantity for legacy deducted rows and zero otherwise", () => {
    const stored = [line()];
    delete stored[0].deductedQty;
    expect(withDeducted(stored, true, false)[0].deductedQty).toBe(2);
    expect(withDeducted(stored, true, true)[0].deductedQty).toBe(0);
    expect(withDeducted(stored, false, false)[0].deductedQty).toBe(0);
    expect(withDeducted([line({ deductedQty: 1 })], true, false)[0].deductedQty).toBe(1);
  });
});

describe("lineForVariant", () => {
  it("prefers a line that still has units unaccounted for", () => {
    const lines = [line({ id: "a", deductedQty: 2 }), line({ id: "b", deductedQty: 0 })];
    expect(lineForVariant(lines, "v1")?.id).toBe("b");
    expect(lineForVariant([line({ id: "a", deductedQty: 2 })], "v1")?.id).toBe("a");
    expect(lineForVariant(lines, "v9")).toBeUndefined();
    expect(lineForVariant(lines, null)).toBeUndefined();
  });
});
