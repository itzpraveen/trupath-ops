/** Owner-supplied treatment: complete feeding pillows need cover/inner billing. */
export function isCompleteFeedingPillow(name: string, variant = "") {
  const text = `${name} ${variant}`.toLowerCase().replace(/[-_]/g, " ");
  return /\bfeeding\s+pillow\b/.test(text) && !/\b(cover|covers|case|inner)\b|\bplain\s+white\b/.test(text);
}

export function assertProductBillingReady(product: { name: string; variant?: string | null; requiresComponentBilling?: boolean }) {
  if (product.requiresComponentBilling || isCompleteFeedingPillow(product.name, product.variant ?? "")) {
    throw new Error(`${product.name}: feeding pillow billing needs the cover selling amount at 5% and the inner selling amount at 18%. The amounts and component billing setup are still pending. Use the existing billing process for this item.`);
  }
}

export function assertShopifyTaxMatches(name: string, expectedRate: number | null | undefined, taxLines: Array<{ ratePct: number }>) {
  if (expectedRate == null || !taxLines.length) return;
  const chargedRate = taxLines.reduce((total, line) => total + line.ratePct, 0);
  if (Math.abs(chargedRate - expectedRate) > 0.001) {
    throw new Error(`${name}: Shopify charged ${chargedRate}% GST, but the product is set to ${expectedRate}%. Review the source tax settings and applicable rate for this order before issuing. The recorded Shopify tax has been preserved.`);
  }
}
