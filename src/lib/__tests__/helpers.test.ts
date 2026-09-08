import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { formToObject, parseForm, zBool, zMoney, zOptionalMoney } from "@/lib/forms";
import { hashPassword, verifyPassword } from "@/lib/password";
import { FailureLimiter } from "@/lib/rate-limit";
import { int, pick, qs, str } from "@/lib/url";
import { z } from "zod";

describe("csv", () => {
  it("escapes quotes, commas and newlines", () => {
    expect(toCsv([{ a: 'say "hi"', b: "x,y", c: "line\nbreak", d: null }])).toBe('a,b,c,d\n"say ""hi""","x,y","line\nbreak",\n');
    expect(toCsv([], ["a", "b"])).toBe("a,b\n");
  });
});

describe("url helpers", () => {
  it("builds query strings without empty values", () => {
    expect(qs({ a: "1", b: "", c: undefined, d: 0 })).toBe("?a=1&d=0");
    expect(qs({})).toBe("");
  });
  it("falls back safely", () => {
    expect(pick("sale", ["all", "sale"], "all")).toBe("sale");
    expect(pick("drop table", ["all", "sale"], "all")).toBe("all");
    expect(int("3")).toBe(3);
    expect(int("-1")).toBe(1);
    expect(int("abc", 7)).toBe(7);
    expect(str(" hi ", 2)).toBe("hi");
  });
});

describe("forms", () => {
  it("turns repeated and [] fields into arrays", () => {
    const fd = new FormData();
    fd.append("productId[]", "a");
    fd.append("productId[]", "b");
    fd.append("qty", "1");
    fd.append("qty", "2");
    fd.append("$ACTION_ID", "ignored");
    expect(formToObject(fd)).toEqual({ productId: ["a", "b"], qty: ["1", "2"] });
  });
  it("parses money and booleans", () => {
    const schema = z.object({ amountP: zMoney("Amount"), gstP: zOptionalMoney, on: zBool, off: zBool });
    const fd = new FormData();
    fd.set("amountP", "1,999.50");
    fd.set("gstP", "");
    fd.set("on", "on");
    const r = parseForm(schema, fd);
    expect(r.ok && r.data).toEqual({ amountP: 199950, gstP: 0, on: true, off: false });
    const bad = new FormData();
    bad.set("amountP", "0");
    const e = parseForm(schema, bad);
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.error).toContain("greater than zero");
  });
});

describe("passwords", () => {
  it("hashes with a salt and verifies", () => {
    const h = hashPassword("change-me-now");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(hashPassword("change-me-now")).not.toBe(h);
    expect(verifyPassword("change-me-now", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
    expect(verifyPassword("x", "plain")).toBe(false);
  });
});

describe("FailureLimiter", () => {
  it("blocks after the limit and frees up as the window slides", () => {
    const l = new FailureLimiter(3, 1000);
    expect(l.retryAfter("k", 0)).toBe(0);
    l.fail("k", 0);
    l.fail("k", 100);
    expect(l.retryAfter("k", 200)).toBe(0);
    l.fail("k", 200);
    expect(l.retryAfter("k", 300)).toBe(700);
    expect(l.retryAfter("k", 1001)).toBe(0);
    expect(l.retryAfter("other", 300)).toBe(0);
    l.fail("k", 1002);
    l.fail("k", 1003);
    expect(l.retryAfter("k", 1004)).toBeGreaterThan(0);
    l.reset("k");
    expect(l.retryAfter("k", 1004)).toBe(0);
  });
});
