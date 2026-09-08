import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { verifyShopifyWebhook } from "@/lib/shopify";
import { decryptSecret, encryptSecret, grantedScopes, hasScope, isValidShop, missingScopes, verifyOAuthHmac } from "@/lib/shopify-oauth";

const env = process.env;
afterEach(() => {
  delete process.env.APP_ENCRYPTION_KEY;
  delete process.env.SHOPIFY_CLIENT_SECRET;
  Object.assign(process.env, { APP_ENCRYPTION_KEY: env.APP_ENCRYPTION_KEY, SHOPIFY_CLIENT_SECRET: env.SHOPIFY_CLIENT_SECRET });
});

describe("scopes", () => {
  it("treats write scopes as implying read", () => {
    const s = grantedScopes("write_inventory, read_orders");
    expect(s.has("read_inventory")).toBe(true);
    expect(hasScope("write_merchant_managed_fulfillment_orders", "read_merchant_managed_fulfillment_orders")).toBe(true);
    expect(missingScopes("read_orders,read_all_orders,read_products,write_inventory,read_locations,read_customers,write_merchant_managed_fulfillment_orders")).toEqual([]);
    expect(missingScopes("read_orders")).toContain("write_inventory");
  });
  it("validates shop domains", () => {
    expect(isValidShop("tswyfk-qm.myshopify.com")).toBe(true);
    expect(isValidShop("evil.com/tswyfk-qm.myshopify.com")).toBe(false);
  });
});

describe("OAuth callback signature", () => {
  const sign = (params: Record<string, string>, secret: string) => {
    const message = Object.entries(params)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    return createHmac("sha256", secret).update(message).digest("hex");
  };
  it("accepts a correctly signed query and rejects tampering", () => {
    const base = { code: "abc", shop: "x.myshopify.com", state: "s1", timestamp: "1700000000" };
    const params = new URLSearchParams({ ...base, hmac: sign(base, "secret") });
    expect(verifyOAuthHmac(params, "secret")).toBe(true);
    expect(verifyOAuthHmac(params, "other")).toBe(false);
    params.set("shop", "y.myshopify.com");
    expect(verifyOAuthHmac(params, "secret")).toBe(false);
    expect(verifyOAuthHmac(new URLSearchParams(base), "secret")).toBe(false);
  });
});

describe("webhook signature", () => {
  it("accepts any of the configured secrets", () => {
    const body = JSON.stringify({ id: 1 });
    const mac = createHmac("sha256", "store-secret").update(body).digest("base64");
    expect(verifyShopifyWebhook(body, mac, [null, "env-secret", "store-secret"])).toBe(true);
    expect(verifyShopifyWebhook(body, mac, ["env-secret"])).toBe(false);
    expect(verifyShopifyWebhook(body + " ", mac, ["store-secret"])).toBe(false);
    expect(verifyShopifyWebhook(body, null, ["store-secret"])).toBe(false);
  });
});

describe("stored secrets", () => {
  it("round-trips with the app key", () => {
    process.env.APP_ENCRYPTION_KEY = "app-key";
    const enc = encryptSecret("shpat_token");
    expect(enc).not.toContain("shpat");
    expect(decryptSecret(enc)).toBe("shpat_token");
    expect(encryptSecret("shpat_token")).not.toBe(enc);
  });
  it("still reads secrets encrypted with the old client-secret fallback after an app key is added", () => {
    delete process.env.APP_ENCRYPTION_KEY;
    process.env.SHOPIFY_CLIENT_SECRET = "client-secret";
    const legacy = encryptSecret("shpat_old");
    process.env.APP_ENCRYPTION_KEY = "new-app-key";
    expect(decryptSecret(legacy)).toBe("shpat_old");
    expect(decryptSecret(encryptSecret("shpat_new"))).toBe("shpat_new");
    process.env.SHOPIFY_CLIENT_SECRET = "rotated";
    expect(() => decryptSecret(legacy)).toThrow();
  });
  it("refuses to run without any key", () => {
    delete process.env.APP_ENCRYPTION_KEY;
    delete process.env.SHOPIFY_CLIENT_SECRET;
    expect(() => encryptSecret("x")).toThrow(/APP_ENCRYPTION_KEY/);
  });
});
