import { describe, expect, it } from "vitest";
import { combineRequirements, materialRequirement, maxMakeable, requirementCostP, shortages, type RecipeLine } from "@/lib/production-plan";

const line = (over: Partial<RecipeLine> = {}): RecipeLine => ({ materialId: "m1", name: "SB Print", unit: "metres", qtyPerUnit: 2.5, wastagePct: 0, costP: 8000, inStock: 100, ...over });

describe("materialRequirement", () => {
  it("multiplies the recipe by the quantity and costs it", () => {
    const [req] = materialRequirement([line()], 10);
    expect(req.required).toBe(25);
    expect(req.perPiece).toBe(2.5);
    expect(req.costP).toBe(200000);
    expect(req.short).toBe(0);
  });

  it("applies wastage the same way production does", () => {
    const [req] = materialRequirement([line({ qtyPerUnit: 1, wastagePct: 5 })], 40);
    expect(req.required).toBe(42);
    expect(req.perPiece).toBe(1.05);
  });

  it("reports the shortfall against what is in the store", () => {
    const reqs = materialRequirement([line({ inStock: 10 }), line({ materialId: "m2", name: "Mull", qtyPerUnit: 1, inStock: 400 })], 10);
    expect(reqs[0].short).toBe(15);
    expect(shortages(reqs)).toHaveLength(1);
    expect(requirementCostP(reqs)).toBe(200000 + 80000);
  });

  it("keeps three decimals, like the material ledger", () => {
    const [req] = materialRequirement([line({ qtyPerUnit: 0.333, wastagePct: 0 })], 3);
    expect(req.required).toBe(0.999);
  });
});

describe("maxMakeable", () => {
  it("is limited by the tightest material", () => {
    expect(maxMakeable([line({ inStock: 100 }), line({ materialId: "m2", qtyPerUnit: 1, inStock: 7 })])).toBe(7);
  });

  it("counts wastage against the store", () => {
    expect(maxMakeable([line({ qtyPerUnit: 1, wastagePct: 10, inStock: 11 })])).toBe(10);
  });

  it("never promises a piece the store cannot cover", () => {
    const lines = [line({ qtyPerUnit: 0.3, wastagePct: 0, inStock: 1 })];
    const n = maxMakeable(lines);
    expect(n).toBe(3);
    expect(materialRequirement(lines, n)[0].short).toBe(0);
  });

  it("is zero without a usable recipe", () => {
    expect(maxMakeable([])).toBe(0);
    expect(maxMakeable([line({ qtyPerUnit: 0 })])).toBe(0);
    expect(maxMakeable([line({ inStock: 0 })])).toBe(0);
  });
});

describe("combineRequirements", () => {
  it("adds the same material across plans and re-checks the shortfall once", () => {
    const a = materialRequirement([line({ inStock: 30 })], 10);
    const b = materialRequirement([line({ inStock: 30 })], 4);
    const [combined] = combineRequirements([a, b]);
    expect(combined.required).toBe(35);
    expect(combined.inStock).toBe(30);
    expect(combined.short).toBe(5);
    expect(combined.costP).toBe(280000);
  });

  it("sorts the shortest material first", () => {
    const a = materialRequirement([line({ inStock: 0 })], 1);
    const b = materialRequirement([line({ materialId: "m2", name: "Mull", inStock: 1000 })], 1);
    expect(combineRequirements([b, a])[0].materialId).toBe("m1");
  });
});
