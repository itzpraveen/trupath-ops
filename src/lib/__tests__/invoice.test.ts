import { describe, expect, it } from "vitest";
import { stateCodeFor, stateName } from "@/lib/india";
import { amountInWords, computeInvoice, formatInvoiceNumber, numberToWords, splitInclusive } from "@/lib/invoice";

describe("splitInclusive", () => {
  it("matches the Tally invoice: 1,999 at 5% is 1,903.81 plus 95.19", () => {
    expect(splitInclusive(199900, 5)).toEqual({ taxableP: 190381, taxP: 9519 });
    expect(splitInclusive(100000, 0)).toEqual({ taxableP: 100000, taxP: 0 });
    expect(splitInclusive(118000, 18)).toEqual({ taxableP: 100000, taxP: 18000 });
  });
});

describe("computeInvoice", () => {
  const line = { description: "Cradle bed", hsn: "5811", ratePct: 5, qty: 1, unit: "PCS", inclP: 199900 };
  it("charges IGST to another state", () => {
    const inv = computeInvoice({ sellerStateCode: "32", buyerStateCode: "33", lines: [line] });
    expect(inv.intraState).toBe(false);
    expect(inv.igstP).toBe(9519);
    expect(inv.cgstP + inv.sgstP).toBe(0);
    expect(inv.totalP).toBe(199900);
    expect(inv.roundOffP).toBe(0);
    expect(inv.lines[0].unitExclP).toBe(190381);
  });
  it("splits CGST and SGST inside the seller's state", () => {
    const inv = computeInvoice({ sellerStateCode: "32", buyerStateCode: "32", lines: [{ ...line, inclP: 399800, qty: 2 }] });
    expect(inv.taxP).toBe(19038);
    expect(inv.cgstP).toBe(9519);
    expect(inv.sgstP).toBe(9519);
    expect(inv.igstP).toBe(0);
    expect(inv.lines[0].unitInclP).toBe(199900);
  });
  it("uses the tax the shop actually charged when given, and rounds to the amount paid", () => {
    const inv = computeInvoice({ sellerStateCode: "32", buyerStateCode: "07", lines: [{ ...line, taxP: 9520 }, { description: "Shipping charges", hsn: "996812", ratePct: 18, qty: 1, unit: "", inclP: 9900, taxP: 1510 }], totalP: 209801 });
    expect(inv.lines[0].taxableP).toBe(190380);
    expect(inv.igstP).toBe(11030);
    expect(inv.roundOffP).toBe(1);
    expect(inv.totalP).toBe(209801);
  });
});

describe("amount in words", () => {
  it("uses the Indian system", () => {
    expect(numberToWords(1999)).toBe("One Thousand Nine Hundred Ninety Nine");
    expect(numberToWords(100000)).toBe("One Lakh");
    expect(numberToWords(123456789)).toBe("Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine");
    expect(numberToWords(20)).toBe("Twenty");
    expect(numberToWords(105)).toBe("One Hundred Five");
  });
  it("formats like the Tally invoice", () => {
    expect(amountInWords(199900)).toBe("INR One Thousand Nine Hundred Ninety Nine Only");
    expect(amountInWords(45050)).toBe("INR Four Hundred Fifty and Fifty Paise Only");
    expect(amountInWords(0)).toBe("INR Zero Only");
  });
  it("numbers invoices the Tally way", () => {
    expect(formatInvoiceNumber("B2C", 611, "26-27")).toBe("B2C/611/26-27");
  });
});

describe("states", () => {
  it("maps Shopify province codes and names to GST codes", () => {
    expect(stateCodeFor({ provinceCode: "TN" })).toBe("33");
    expect(stateCodeFor({ provinceCode: "KL", province: "Kerala" })).toBe("32");
    expect(stateCodeFor({ province: "Tamil Nadu" })).toBe("33");
    expect(stateCodeFor({ provinceCode: "TS" })).toBe("36");
    expect(stateCodeFor({ province: "Orissa" })).toBe("21");
    expect(stateCodeFor({ provinceCode: "XX", province: "Nowhere" })).toBeNull();
    expect(stateName("33")).toBe("Tamil Nadu");
    expect(stateName("7")).toBe("Delhi");
  });
});

describe("invalid invoice inputs", () => {
  const line = { description: "Cradle bed", hsn: "5811", ratePct: 5, qty: 1, unit: "PCS", inclP: 105000 };
  it("never hides an unallocated order discount as round-off", () => {
    expect(() => computeInvoice({ sellerStateCode: "32", buyerStateCode: "33", lines: [line], totalP: 94500 })).toThrow(/round-off/);
    const discounted = computeInvoice({ sellerStateCode: "32", buyerStateCode: "33", lines: [{ ...line, inclP: 94500, taxP: 4500 }] });
    expect([discounted.taxableP, discounted.igstP, discounted.roundOffP]).toEqual([90000, 4500, 0]);
  });
  it("rejects missing HSN and inconsistent source tax", () => {
    expect(() => computeInvoice({ sellerStateCode: "32", buyerStateCode: "33", lines: [{ ...line, hsn: "" }] })).toThrow(/HSN/);
    expect(() => computeInvoice({ sellerStateCode: "32", buyerStateCode: "33", lines: [{ ...line, taxP: 4500 }] })).toThrow(/do not agree/);
  });
});
