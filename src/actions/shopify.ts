"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { shopifyOrders } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireEditor } from "@/lib/auth";
import { errorMessage, parseForm, zBool, zOptional, zOptionalUuid, zRequired, type ActionState } from "@/lib/forms";
import { refreshStoreWebhooks, syncShopify, syncSingleOrder, testShopifyConnection } from "@/lib/shopify";
import { clearStoreToken, getStore, getStoreByShop, isValidShop, storeAuth, upsertStore } from "@/lib/shopify-oauth";

function revalidateAll() {
  for (const p of ["/orders", "/products", "/stock", "/sales", "/settings/shopify", "/"]) revalidatePath(p);
}

export async function runShopifySync(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireEditor("orders");
    const full = formData.get("full") === "1";
    const storeId = String(formData.get("storeId") ?? "") || undefined;
    const result = await syncShopify({ trigger: "manual", full, sinceDays: full ? 365 : 30, storeId });
    revalidateAll();
    if (result.skipped) return { ok: true, message: "A sync is already running. Try again in a minute." };
    const msg = `Synced ${result.ordersUpserted} orders and ${result.productsUpserted} product variants${result.stores > 1 ? ` across ${result.stores} stores` : ""}`;
    return result.errors.length ? { error: `${msg}. Problems: ${result.errors.join(" | ")}` } : { ok: true, message: msg };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function resyncOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireEditor("orders");
    const id = String(formData.get("id") ?? "");
    if (!/^\d+$/.test(id)) return { error: "Invalid order" };
    const [order] = await db.select({ shop: shopifyOrders.shop }).from(shopifyOrders).where(eq(shopifyOrders.id, id)).limit(1);
    const store = order?.shop ? await getStoreByShop(order.shop) : null;
    const auth = store ? storeAuth(store) : null;
    if (!auth) return { error: "The store this order came from is not connected." };
    const found = await syncSingleOrder(id, auth);
    revalidateAll();
    revalidatePath(`/orders/${id}`);
    return found ? { ok: true, message: "Order refreshed from Shopify" } : { error: "Shopify no longer has this order" };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

async function authFor(storeId: string) {
  const store = await getStore(storeId);
  if (!store) throw new Error("Store not found");
  const auth = storeAuth(store);
  if (!auth) throw new Error(`${store.label} is not connected yet.`);
  return { store, auth };
}

export async function testShopify(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireEditor("settings");
    const { auth } = await authFor(String(formData.get("storeId") ?? ""));
    const shop = await testShopifyConnection(auth);
    return { ok: true, message: `Connected to ${shop.name} (${shop.myshopifyDomain}, ${shop.currencyCode})` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function disconnectShopify(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("settings");
    const store = await getStore(String(formData.get("storeId") ?? ""));
    if (!store) return { error: "Store not found" };
    await clearStoreToken(store.id);
    await audit(db, { userId: user.id, action: "disconnect", entityType: "shopify", entityId: store.shop, summary: `Disconnected ${store.label}` });
    revalidateAll();
    return { ok: true, message: `${store.label} disconnected. Orders already synced are kept.` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function registerShopifyWebhooks(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireEditor("settings");
    const base = process.env.APP_URL?.trim();
    if (!base || !base.startsWith("https://")) return { error: "APP_URL must be set to the public https address of this app before webhooks can be registered." };
    const { auth } = await authFor(String(formData.get("storeId") ?? ""));
    const topics = await refreshStoreWebhooks(base, auth);
    revalidateAll();
    return { ok: true, message: `Webhooks active for ${auth.label}: ${topics.map((t) => t.toLowerCase().replace("_", "/")).join(", ")}` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const storeSchema = z.object({
  id: zOptionalUuid,
  shop: zRequired("Store domain", 120).transform((v) => v.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")),
  label: zRequired("Name", 80),
  brandId: zRequired("Brand", 40),
  entityId: zRequired("Books", 40),
  channel: zOptional(80),
  clientId: zOptional(120),
  clientSecret: zOptional(200),
  active: zBool,
});

export async function saveShopifyStore(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("settings");
    const parsed = parseForm(storeSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    if (!isValidShop(d.shop)) return { error: "Enter the store's myshopify.com domain, for example tswyfk-qm.myshopify.com", fieldErrors: { shop: ["Must end with .myshopify.com"] } };
    const dup = await getStoreByShop(d.shop);
    if (dup && dup.id !== d.id) return { error: "That store is already listed", fieldErrors: { shop: ["Already listed"] } };
    const id = await upsertStore({ id: d.id, shop: d.shop, label: d.label, brandId: d.brandId, entityId: d.entityId, channel: d.channel ?? "Own website", clientId: d.clientId ?? null, clientSecret: d.clientSecret ?? null, active: d.id ? d.active : true });
    await audit(db, { userId: user.id, action: d.id ? "update" : "create", entityType: "shopify", entityId: d.shop, summary: `${d.id ? "Updated" : "Added"} store ${d.label}` });
    revalidateAll();
    return { ok: true, message: d.id ? "Store saved" : `${d.label} added. Now press Connect.`, id };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}
