export type FulfillmentOrderNode = { id: string; status: string; lineItems: { pageInfo?: { hasNextPage: boolean }; nodes: Array<{ id: string; remainingQuantity: number; totalQuantity: number; lineItem: { variant: { id: string } | null } }> } };

/** A dispatch is the cumulative quantity sent for this order, never permission to fulfil the remainder. */
export function fulfillmentPlan(orders: FulfillmentOrderNode[], requested?: Array<{ variantId: string | null; qty: number }>) {
  if (orders.some((o) => o.lineItems.pageInfo?.hasNextPage)) throw new Error("This order has too many fulfillment lines. Complete its fulfillment in Shopify.");
  const wanted = new Map<string, number>();
  if (requested) {
    if (!requested.length || requested.some((r) => !r.variantId || !Number.isSafeInteger(r.qty) || r.qty <= 0)) throw new Error("Every dispatched item must match a Shopify variant before fulfilling this parcel");
    for (const r of requested) wanted.set(r.variantId!, (wanted.get(r.variantId!) ?? 0) + r.qty);
    for (const [variant, qty] of wanted) {
      const matches = orders.filter((o) => !["CANCELLED", "CANCELED"].includes(o.status)).flatMap((o) => o.lineItems.nodes).filter((l) => l.lineItem.variant?.id.split("/").pop() === variant);
      if (!matches.length) throw new Error("A dispatched item could not be found in Shopify fulfillment orders");
      const sent = matches.reduce((sum, l) => sum + l.totalQuantity - l.remainingQuantity, 0);
      wanted.set(variant, Math.max(0, qty - sent));
    }
  }
  const plan = orders.filter((o) => ["OPEN", "IN_PROGRESS"].includes(o.status)).map((o) => ({
    fulfillmentOrderId: o.id,
    fulfillmentOrderLineItems: o.lineItems.nodes.flatMap((l) => {
      const variant = l.lineItem.variant?.id.split("/").pop() ?? "";
      const quantity = requested ? Math.min(l.remainingQuantity, wanted.get(variant) ?? 0) : l.remainingQuantity;
      if (requested) wanted.set(variant, (wanted.get(variant) ?? 0) - quantity);
      return quantity > 0 ? [{ id: l.id, quantity }] : [];
    }),
  })).filter((o) => o.fulfillmentOrderLineItems.length);
  if ([...wanted.values()].some((qty) => qty > 0)) throw new Error("The dispatched quantities exceed the items available to fulfil in Shopify");
  return plan;
}
