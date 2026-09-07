"use server";

import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/auth";
import { errorMessage, type ActionState } from "@/lib/forms";
import { registerWebhooks, syncShopify, syncSingleOrder, testShopifyConnection } from "@/lib/shopify";
import { clearConnection, loadConnection, saveConnection } from "@/lib/shopify-oauth";
import { db } from "@/db";
import { audit } from "@/lib/audit";

function revalidateAll() {
  for (const p of ["/orders", "/products", "/stock", "/sales", "/settings/shopify", "/"]) revalidatePath(p);
}

export async function runShopifySync(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireEditor("orders");
    const full = formData.get("full") === "1";
    const result = await syncShopify({ trigger: "manual", full, sinceDays: full ? 365 : 30 });
    revalidateAll();
    if (result.skipped) return { ok: true, message: "A sync is already running. Try again in a minute." };
    return { ok: true, message: `Synced ${result.ordersUpserted} orders and ${result.productsUpserted} product variants` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function resyncOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireEditor("orders");
    const id = String(formData.get("id") ?? "");
    if (!/^\d+$/.test(id)) return { error: "Invalid order" };
    const found = await syncSingleOrder(id);
    revalidateAll();
    revalidatePath(`/orders/${id}`);
    return found ? { ok: true, message: "Order refreshed from Shopify" } : { error: "Shopify no longer has this order" };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function testShopify(): Promise<ActionState> {
  try {
    await requireEditor("settings");
    const shop = await testShopifyConnection();
    return { ok: true, message: `Connected to ${shop.name} (${shop.myshopifyDomain}, ${shop.currencyCode})` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function disconnectShopify(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  void _formData;
  try {
    const user = await requireEditor("settings");
    await clearConnection();
    await audit(db, { userId: user.id, action: "disconnect", entityType: "shopify", summary: "Disconnected the Shopify store" });
    revalidateAll();
    return { ok: true, message: "Shopify disconnected. Orders already synced are kept." };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function registerShopifyWebhooks(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  void _formData;
  try {
    await requireEditor("settings");
    const base = process.env.APP_URL?.trim();
    if (!base || !base.startsWith("https://")) return { error: "APP_URL must be set to the public https address of this app before webhooks can be registered." };
    const topics = await registerWebhooks(base);
    const conn = await loadConnection();
    if (conn) await saveConnection({ ...conn, webhooks: topics });
    revalidateAll();
    return { ok: true, message: `Webhooks active: ${topics.map((t) => t.toLowerCase().replace("_", "/")).join(", ")}` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}
