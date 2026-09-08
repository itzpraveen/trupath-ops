import { describe, expect, it } from "vitest";
import { fulfillmentPlan, type FulfillmentOrderNode } from "@/lib/fulfillment-plan";
const order = (remaining = 2): FulfillmentOrderNode => ({ id: "fo", status: "OPEN", lineItems: { nodes: [{ id: "li", remainingQuantity: remaining, totalQuantity: 2, lineItem: { variant: { id: "gid://shopify/ProductVariant/1" } } }] } });
describe("parcel fulfillment quantities", () => {
  it("fulfils only the one unit in a partial parcel", () => expect(fulfillmentPlan([order()], [{ variantId: "1", qty: 1 }])[0].fulfillmentOrderLineItems).toEqual([{ id: "li", quantity: 1 }]));
  it("does not repeat the first parcel on retry", () => expect(fulfillmentPlan([order(1)], [{ variantId: "1", qty: 1 }])).toEqual([]));
  it("rejects unmatched or excessive quantities before any external mutation", () => {
    expect(() => fulfillmentPlan([order()], [{ variantId: null, qty: 1 }])).toThrow(/match/);
    expect(() => fulfillmentPlan([order()], [{ variantId: "1", qty: 3 }])).toThrow(/exceed/);
  });
  it("refuses truncated fulfillment data", () => expect(() => fulfillmentPlan([{ ...order(), lineItems: { ...order().lineItems, pageInfo: { hasNextPage: true } } }])).toThrow(/too many/));
});
