import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

/** Admin API scopes the app asks for during install. */
export const SHOPIFY_SCOPES = ["read_orders", "read_all_orders", "read_products", "read_inventory", "read_customers"] as const;
export const WEBHOOK_TOPICS = ["ORDERS_CREATE", "ORDERS_UPDATED", "ORDERS_CANCELLED", "REFUNDS_CREATE", "PRODUCTS_UPDATE"] as const;

export type ShopifyConnection = { shop: string; token: string; scope: string; installedAt: string; webhooks: string[] };
type StoredConnection = { shop: string; tokenEnc: string; scope: string; installedAt: string; webhooks: string[] };
const KEY = "shopify.connection";

function encKey() {
  const secret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  if (!secret) throw new Error("SHOPIFY_CLIENT_SECRET is not set");
  return createHash("sha256").update(secret).digest();
}
export function encryptSecret(text: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(), iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}
export function decryptSecret(b64: string) {
  const buf = Buffer.from(b64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", encKey(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

let cache: { at: number; value: ShopifyConnection | null } | null = null;

export async function loadConnection(): Promise<ShopifyConnection | null> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
  let value: ShopifyConnection | null = null;
  if (row) {
    try {
      const v = row.value as StoredConnection;
      value = { shop: v.shop, token: decryptSecret(v.tokenEnc), scope: v.scope, installedAt: v.installedAt, webhooks: v.webhooks ?? [] };
    } catch {
      value = null; // secret changed or row corrupt; treat as disconnected
    }
  }
  cache = { at: Date.now(), value };
  return value;
}

export async function saveConnection(c: ShopifyConnection) {
  const value: StoredConnection = { shop: c.shop, tokenEnc: encryptSecret(c.token), scope: c.scope, installedAt: c.installedAt, webhooks: c.webhooks };
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  cache = null;
}

export async function clearConnection() {
  await db.delete(settings).where(eq(settings.key, KEY));
  cache = null;
}

export function isValidShop(shop: string) {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

export function oauthClient() {
  return { clientId: process.env.SHOPIFY_CLIENT_ID?.trim(), clientSecret: process.env.SHOPIFY_CLIENT_SECRET?.trim() };
}

export function buildAuthorizeUrl(shop: string, state: string, redirectUri: string) {
  const { clientId } = oauthClient();
  if (!clientId) throw new Error("SHOPIFY_CLIENT_ID is not set");
  const u = new URL(`https://${shop}/admin/oauth/authorize`);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("scope", SHOPIFY_SCOPES.join(","));
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  return u.toString();
}

/** Verify the hmac Shopify appends to the OAuth callback query string. */
export function verifyOAuthHmac(params: URLSearchParams) {
  const { clientSecret } = oauthClient();
  const hmac = params.get("hmac");
  if (!clientSecret || !hmac) return false;
  const esc = (s: string) => s.replace(/%/g, "%25").replace(/&/g, "%26").replace(/=/g, "%3D");
  const message = [...params.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${esc(k)}=${esc(v)}`)
    .join("&");
  const digest = createHmac("sha256", clientSecret).update(message).digest("hex");
  const a = Buffer.from(digest);
  const b = Buffer.from(hmac);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function exchangeCodeForToken(shop: string, code: string): Promise<{ token: string; scope: string }> {
  const { clientId, clientSecret } = oauthClient();
  if (!clientId || !clientSecret) throw new Error("SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET are not set");
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; scope?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`Shopify did not issue a token: ${json.error_description ?? json.error ?? `HTTP ${res.status}`}`);
  return { token: json.access_token, scope: json.scope ?? "" };
}
