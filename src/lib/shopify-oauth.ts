import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { shopifyStores, type ShopifyStore } from "@/db/schema";

/** Admin API scopes the app asks for during install. */
export const SHOPIFY_SCOPES = ["read_orders", "read_all_orders", "read_products", "read_inventory", "read_customers"] as const;
export const WEBHOOK_TOPICS = ["ORDERS_CREATE", "ORDERS_UPDATED", "ORDERS_CANCELLED", "REFUNDS_CREATE", "PRODUCTS_UPDATE"] as const;

export type StoreAuth = {
  storeId: string;
  shop: string;
  label: string;
  token: string;
  version: string;
  brandId: string;
  entityId: string;
  channel: string;
  baselineAt: Date | null;
};

/* ---------------- encryption ---------------- */

function encKey() {
  const secret = process.env.APP_ENCRYPTION_KEY?.trim() || process.env.SHOPIFY_CLIENT_SECRET?.trim();
  if (!secret) throw new Error("Set APP_ENCRYPTION_KEY (or SHOPIFY_CLIENT_SECRET) on the server so store secrets can be stored safely.");
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
function tryDecrypt(b64: string | null | undefined): string | null {
  if (!b64) return null;
  try {
    return decryptSecret(b64);
  } catch {
    return null;
  }
}

/* ---------------- stores ---------------- */

export function shopifyApiVersion() {
  return process.env.SHOPIFY_API_VERSION?.trim() || "2026-07";
}

export function isValidShop(shop: string) {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

export async function listStores(): Promise<ShopifyStore[]> {
  return db.select().from(shopifyStores).orderBy(asc(shopifyStores.createdAt));
}
export async function getStore(id: string): Promise<ShopifyStore | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db.select().from(shopifyStores).where(eq(shopifyStores.id, id)).limit(1);
  return row ?? null;
}
export async function getStoreByShop(shop: string): Promise<ShopifyStore | null> {
  const [row] = await db.select().from(shopifyStores).where(eq(shopifyStores.shop, shop.toLowerCase())).limit(1);
  return row ?? null;
}

/** The store's own app credentials, else the ones from the environment (first store). */
export function storeCredentials(store: ShopifyStore): { clientId: string | null; clientSecret: string | null } {
  const ownSecret = tryDecrypt(store.clientSecretEnc);
  const envShop = process.env.SHOPIFY_STORE_DOMAIN?.trim().toLowerCase();
  const envApplies = !envShop || envShop === store.shop; // the environment credentials belong to the env store only
  return {
    clientId: store.clientId ?? (envApplies ? process.env.SHOPIFY_CLIENT_ID?.trim() ?? null : null),
    clientSecret: ownSecret ?? (envApplies ? process.env.SHOPIFY_CLIENT_SECRET?.trim() ?? null : null),
  };
}

/** Access token: the installed token, or the legacy env token for the env store. */
export function storeToken(store: ShopifyStore): string | null {
  const own = tryDecrypt(store.tokenEnc);
  if (own) return own;
  const envShop = process.env.SHOPIFY_STORE_DOMAIN?.trim().toLowerCase();
  const envToken = process.env.SHOPIFY_ADMIN_TOKEN?.trim();
  if (envShop === store.shop && envToken) return envToken;
  return null;
}

export function storeAuth(store: ShopifyStore): StoreAuth | null {
  const token = storeToken(store);
  if (!token || !store.active) return null;
  return { storeId: store.id, shop: store.shop, label: store.label, token, version: shopifyApiVersion(), brandId: store.brandId, entityId: store.entityId, channel: store.channel, baselineAt: store.baselineAt };
}

export async function listConnectedAuths(): Promise<StoreAuth[]> {
  return (await listStores()).map(storeAuth).filter((a): a is StoreAuth => !!a);
}

export async function upsertStore(input: { id?: string; shop: string; label: string; brandId: string; entityId: string; channel: string; clientId?: string | null; clientSecret?: string | null; active?: boolean }) {
  const values = {
    shop: input.shop.toLowerCase(),
    label: input.label,
    brandId: input.brandId,
    entityId: input.entityId,
    channel: input.channel,
    ...(input.clientId !== undefined ? { clientId: input.clientId || null } : {}),
    ...(input.clientSecret ? { clientSecretEnc: encryptSecret(input.clientSecret) } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
  };
  if (input.id) {
    await db.update(shopifyStores).set(values).where(eq(shopifyStores.id, input.id));
    return input.id;
  }
  const [row] = await db.insert(shopifyStores).values(values).returning({ id: shopifyStores.id });
  return row.id;
}

export async function saveStoreToken(storeId: string, data: { token: string; scope: string; webhooks: string[] }) {
  const [existing] = await db.select({ baselineAt: shopifyStores.baselineAt }).from(shopifyStores).where(eq(shopifyStores.id, storeId)).limit(1);
  const now = new Date();
  await db
    .update(shopifyStores)
    .set({ tokenEnc: encryptSecret(data.token), scope: data.scope, webhooks: data.webhooks, installedAt: now, baselineAt: existing?.baselineAt ?? now })
    .where(eq(shopifyStores.id, storeId));
}

export async function setStoreWebhooks(storeId: string, webhooks: string[]) {
  await db.update(shopifyStores).set({ webhooks }).where(eq(shopifyStores.id, storeId));
}

export async function clearStoreToken(storeId: string) {
  await db.update(shopifyStores).set({ tokenEnc: null, scope: null, installedAt: null, webhooks: [] }).where(eq(shopifyStores.id, storeId));
}

/* ---------------- OAuth helpers ---------------- */

export function buildAuthorizeUrl(shop: string, clientId: string, state: string, redirectUri: string) {
  const u = new URL(`https://${shop}/admin/oauth/authorize`);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("scope", SHOPIFY_SCOPES.join(","));
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  return u.toString();
}

/** Verify the hmac Shopify appends to the OAuth callback query string. */
export function verifyOAuthHmac(params: URLSearchParams, clientSecret: string) {
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

export async function exchangeCodeForToken(shop: string, code: string, clientId: string, clientSecret: string): Promise<{ token: string; scope: string }> {
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
