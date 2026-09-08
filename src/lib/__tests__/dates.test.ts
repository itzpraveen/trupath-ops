import { describe, expect, it } from "vitest";
import { addDays, financialYear, fyRange, isYmd, monthRange, shiftMonth } from "@/lib/dates";

describe("financial year", () => {
  it("starts in April", () => {
    expect(financialYear("2026-09-07")).toBe("26-27");
    expect(financialYear("2026-04-01")).toBe("26-27");
    expect(financialYear("2026-03-31")).toBe("25-26");
    expect(fyRange("2026-01-15")).toEqual(["2025-04-01", "2026-03-31"]);
    expect(fyRange("2026-09-08")).toEqual(["2026-04-01", "2027-03-31"]);
  });
});

describe("months and days", () => {
  it("knows month lengths, including leap years", () => {
    expect(monthRange("2024-02")).toEqual(["2024-02-01", "2024-02-29"]);
    expect(monthRange("2026-02")).toEqual(["2026-02-01", "2026-02-28"]);
    expect(monthRange("2026-12")).toEqual(["2026-12-01", "2026-12-31"]);
  });
  it("shifts months across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11", 3)).toBe("2027-02");
  });
  it("adds days across month ends", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("validates dates", () => {
    expect(isYmd("2026-02-30")).toBe(false);
    expect(isYmd("2026-02-28")).toBe(true);
    expect(isYmd("28-02-2026")).toBe(false);
  });
});
