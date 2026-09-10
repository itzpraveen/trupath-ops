import { describe, expect, it } from "vitest";
import { catalogueMatchKey, suggestCatalogueProducts } from "@/lib/product-catalogue";
import { catalogueEntry } from "@/lib/catalogue-data";
import { assertProductBillingReady, assertShopifyTaxMatches, isCompleteFeedingPillow } from "@/lib/product-tax";

describe("supplied product matching and tax rules", () => {
  it("matches formatting and observed spelling changes without merging product components or variants", () => {
    expect(catalogueMatchKey("CRADLE BED COLOR SPLASH")).toBe(catalogueMatchKey("Baby Cradle Bed Colourspalsh"));
    expect(catalogueMatchKey("HOLDER AVACADO")).toBe(catalogueMatchKey("Avocado Baby Holder"));
    expect(catalogueMatchKey("PILLOW COVER CHOCO SKY")).not.toBe(catalogueMatchKey("Feeding Pillow Choco Sky"));
    expect(catalogueMatchKey("BLANKET DREAMY NIGHT WHITE")).not.toBe(catalogueMatchKey("Baby Blanket Dreamy Night"));
    expect(catalogueMatchKey("Carry Nest Dew Drops")).not.toBe(catalogueMatchKey("Carry Nest Dew Drops Combo"));
  });
  it("keeps duplicate candidates for review and honors an existing explicit link", () => {
    const entry = catalogueEntry("stk-2")!;
    const candidates = ["a", "b"].map((id) => ({ id, name: "Baby Blanket Choco Sky", variant: "", catalogueRef: null as string | null }));
    expect(suggestCatalogueProducts(entry, candidates)).toHaveLength(2);
    candidates[1].catalogueRef = entry.ref;
    candidates[1].name = "Renamed in Shopify";
    expect(suggestCatalogueProducts(entry, candidates).map((item) => item.id)).toEqual(["b"]);
  });
  it("distinguishes the supplied cover and inner rates and preserves unknowns", () => {
    expect(catalogueEntry("stk-74")).toMatchObject({ hsnCode: "6304", gstRate: 5, requiresComponentBilling: false });
    expect(catalogueEntry("stk-53")).toMatchObject({ hsnCode: "5811", gstRate: 18, requiresComponentBilling: false });
    expect(catalogueEntry("stk-38")).toMatchObject({ gstRate: null, purchasePriceP: null, salePriceP: null });
    expect(catalogueEntry("stk-54")).toBeUndefined();
  });
  it("holds complete feeding pillows while allowing the separate cover and inner", () => {
    expect(() => assertProductBillingReady({ name: "Feeding Pillow Choco Sky" })).toThrow(/cover selling amount at 5%/);
    expect(() => assertProductBillingReady({ name: "Renamed pillow", requiresComponentBilling: true })).toThrow(/18%/);
    for (const name of ["Feeding Pillow Cover Choco Sky", "Pillow Plain White", "Feeding Pillow Inner"]) {
      expect(isCompleteFeedingPillow(name)).toBe(false);
      expect(() => assertProductBillingReady({ name })).not.toThrow();
    }
  });
  it("accepts IGST 5% or CGST/SGST 2.5% each and rejects conflicting aggregate rates", () => {
    expect(() => assertShopifyTaxMatches("Cradle", 5, [{ ratePct: 5 }])).not.toThrow();
    expect(() => assertShopifyTaxMatches("Cradle", 5, [{ ratePct: 2.5 }, { ratePct: 2.5 }])).not.toThrow();
    expect(() => assertShopifyTaxMatches("Cradle", 5, [{ ratePct: 5 }, { ratePct: 5 }])).toThrow(/charged 10%/);
    expect(() => assertShopifyTaxMatches("Cradle", 5, [{ ratePct: 18 }])).toThrow(/product is set to 5%/);
    expect(() => assertShopifyTaxMatches("Unconfigured", null, [{ ratePct: 18 }])).not.toThrow();
  });
});
