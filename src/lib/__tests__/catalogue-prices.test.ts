import { describe, expect, it } from "vitest";
import publicCatalogue from "@/data/product-catalogue-2026-09-10.json";
import { parseCataloguePrices } from "@/lib/catalogue-prices";

describe("private catalogue prices", () => {
  it("keeps price references out of the public seed", () => {
    expect(publicCatalogue.entries.every((entry) => entry.purchasePriceP === null && entry.salePriceP === null)).toBe(true);
    expect(parseCataloguePrices(undefined, ["stk-2"])).toEqual({});
  });
  it("accepts paise amounts and missing values", () => {
    const prices = { "stk-2": { purchasePriceP: 12345, salePriceP: null } };
    expect(parseCataloguePrices(JSON.stringify(prices), ["stk-2"])).toEqual(prices);
  });
  it("rejects malformed amounts and unknown rows without exposing the values", () => {
    for (const raw of ["private-invalid-input", '{"stk-2":{"purchasePriceP":-7,"salePriceP":1}}', '{"unknown":{"purchasePriceP":1,"salePriceP":null}}']) {
      expect(() => parseCataloguePrices(raw, ["stk-2"])).toThrow("The private catalogue price configuration is invalid. Contact the administrator.");
    }
  });
});
