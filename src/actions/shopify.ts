"use server";

import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/auth";
import { errorMessage, type ActionState } from "@/lib/forms";
import { syncShopify, syncSingleOrder, testShopifyConnection } from "@/lib/shopify";

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
