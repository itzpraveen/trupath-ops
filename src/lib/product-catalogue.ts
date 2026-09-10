export type CatalogueEntry = {
  ref: string; row: number; name: string; hsnCode: string; gstRate: number | null;
  requiresComponentBilling: boolean; purchasePriceP: number | null; salePriceP: number | null; category: string;
};

/** Only spelling, punctuation, word order and the optional 'Baby' label are normalized.
 * Keep size, colour, cover/inner and bundle words so those products cannot silently merge. */
export function catalogueMatchKey(value: string) {
  return value.toLowerCase().normalize("NFKD")
    .replace(/avacado/g, "avocado")
    .replace(/colourspalsh|colorspalsh|colour\s+splash|color\s+spalsh/g, "color splash")
    .replace(/carrynest/g, "carry nest")
    .replace(/nightpink/g, "night pink")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/).filter((word) => word && word !== "baby").sort().join(" ");
}

export function suggestCatalogueProducts<T extends { id: string; name: string; variant: string; catalogueRef: string | null }>(entry: CatalogueEntry, products: T[]) {
  const linked = products.filter((product) => product.catalogueRef === entry.ref);
  if (linked.length) return linked;
  const key = catalogueMatchKey(entry.name);
  return products.filter((product) => !product.catalogueRef && catalogueMatchKey(`${product.name} ${product.variant}`) === key);
}
