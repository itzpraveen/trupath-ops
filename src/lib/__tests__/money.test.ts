import { describe, expect, it } from "vitest";
import { formatINR, formatINRCompact, toPaise, toRupees } from "@/lib/money";

describe("toPaise", () => {
  it("parses amounts typed by people", () => {
    expect(toPaise("1,234.50")).toBe(123450);
    expect(toPaise("₹ 999")).toBe(99900);
    expect(toPaise("0.29")).toBe(29);
    expect(toPaise(19.99)).toBe(1999);
  });
  it("rejects nonsense", () => {
    expect(() => toPaise("abc")).toThrow();
  });
});

describe("toRupees", () => {
  it("drops the decimals for whole rupees only", () => {
    expect(toRupees(123400)).toBe("1234");
    expect(toRupees(123450)).toBe("1234.50");
    expect(toRupees(null)).toBe("0");
  });
});

describe("formatINR", () => {
  it("formats in Indian style", () => {
    expect(formatINR(123456700)).toBe("₹12,34,567");
    expect(formatINR(123450)).toBe("₹1,234.50");
    expect(formatINR(100000, { exact: true })).toBe("₹1,000.00");
  });
  it("compacts large values for tiles", () => {
    expect(formatINRCompact(12345600)).toBe("₹1.23L");
    expect(formatINRCompact(250000000)).toBe("₹25.00L");
    expect(formatINRCompact(-2500000000)).toBe("-₹2.50Cr");
    expect(formatINRCompact(4550)).toBe("₹45.50");
  });
});
