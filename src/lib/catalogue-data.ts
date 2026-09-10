import "server-only";
import data from "@/data/product-catalogue-2026-09-10.json";
import type { CatalogueEntry } from "@/lib/product-catalogue";
import { parseCataloguePrices } from "@/lib/catalogue-prices";

// This repository is public. Reference prices belong in private server configuration.
const prices = parseCataloguePrices(process.env.PRODUCT_CATALOGUE_PRICES_JSON, data.entries.map((entry) => entry.ref));
export const suppliedCatalogue: Omit<typeof data, "entries"> & { entries: CatalogueEntry[] } = {
  ...data, entries: data.entries.map((entry) => ({ ...entry, ...prices[entry.ref] })),
};
export const catalogueEntry = (ref: string | null | undefined) => suppliedCatalogue.entries.find((entry) => entry.ref === ref);
