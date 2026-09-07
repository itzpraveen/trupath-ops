import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { db } from "@/db";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { registerWebhooks, syncShopify } from "@/lib/shopify";
import { exchangeCodeForToken, getStore, getStoreByShop, saveStoreToken, shopifyApiVersion, storeCredentials, verifyOAuthHmac } from "@/lib/shopify-oauth";

export async function GET(request: NextRequest) {
  const base = (process.env.APP_URL?.trim() || request.nextUrl.origin).replace(/\/$/, "");
  const back = (msg: string) => NextResponse.redirect(`${base}/settings/shopify?error=${encodeURIComponent(msg)}`);
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") return back("Sign in as the owner, then start the connection again.");

  const params = request.nextUrl.searchParams;
  const shop = (params.get("shop") ?? "").toLowerCase();
  const code = params.get("code") ?? "";
  const state = params.get("state") ?? "";
  const [expectedState, storeId] = (request.cookies.get("shopify_oauth_state")?.value ?? "").split(":");
  if (!code || !state || state !== expectedState || !storeId) return back("The connection attempt expired or did not match. Start again from this page.");
  const store = await getStore(storeId);
  const byShop = await getStoreByShop(shop);
  if (!store || !byShop || byShop.id !== store.id) return back("Shopify returned a different store than the one you started connecting.");
  const { clientId, clientSecret } = storeCredentials(store);
  if (!clientId || !clientSecret) return back("The store's app credentials are missing.");
  if (!verifyOAuthHmac(params, clientSecret)) return back("Shopify's signature did not verify. Check the client secret for this store.");

  try {
    const { token, scope } = await exchangeCodeForToken(shop, code, clientId, clientSecret);
    const auth = { storeId: store.id, shop, label: store.label, token, version: shopifyApiVersion(), brandId: store.brandId, entityId: store.entityId, channel: store.channel, baselineAt: store.baselineAt, scope, pushInventory: store.pushInventory, locationId: store.locationId };
    let webhooks: string[] = [];
    let webhookNote = "";
    try {
      webhooks = await registerWebhooks(base, auth);
    } catch (err) {
      webhookNote = err instanceof Error ? err.message : String(err);
    }
    await saveStoreToken(store.id, { token, scope, webhooks });
    await audit(db, { userId: user.id, action: "connect", entityType: "shopify", entityId: shop, summary: `Connected ${store.label} (${shop}; ${scope})${webhookNote ? ` · webhooks: ${webhookNote}` : ""}` });
    after(async () => {
      try {
        await syncShopify({ trigger: "install", full: true, sinceDays: 365, storeId: store.id });
      } catch (err) {
        console.error("[shopify install] first sync failed:", err instanceof Error ? err.message : err);
      }
    });
    for (const p of ["/settings/shopify", "/orders", "/products", "/stock", "/sales", "/"]) revalidatePath(p);
    const res = NextResponse.redirect(`${base}/settings/shopify?connected=${encodeURIComponent(store.label)}${webhookNote ? `&warn=${encodeURIComponent(webhookNote)}` : ""}`);
    res.cookies.delete("shopify_oauth_state");
    return res;
  } catch (err) {
    return back(err instanceof Error ? err.message : "Could not complete the connection.");
  }
}
