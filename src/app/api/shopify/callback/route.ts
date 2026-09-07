import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { db } from "@/db";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { registerWebhooks, shopifyApiVersion, syncShopify } from "@/lib/shopify";
import { ensureStockBaseline, exchangeCodeForToken, isValidShop, saveConnection, verifyOAuthHmac } from "@/lib/shopify-oauth";

export async function GET(request: NextRequest) {
  const base = (process.env.APP_URL?.trim() || request.nextUrl.origin).replace(/\/$/, "");
  const back = (msg: string) => NextResponse.redirect(`${base}/settings/shopify?error=${encodeURIComponent(msg)}`);
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") return back("Sign in as the owner, then start the connection again.");

  const params = request.nextUrl.searchParams;
  const shop = (params.get("shop") ?? "").toLowerCase();
  const code = params.get("code") ?? "";
  const state = params.get("state") ?? "";
  const cookie = request.cookies.get("shopify_oauth_state")?.value ?? "";
  const [expectedState, expectedShop] = cookie.split(":");
  if (!code || !state || state !== expectedState || shop !== expectedShop) return back("The connection attempt expired or did not match. Start again from this page.");
  if (!isValidShop(shop)) return back("Shopify returned an unexpected store domain.");
  if (!verifyOAuthHmac(params)) return back("Shopify's signature did not verify. Check SHOPIFY_CLIENT_SECRET.");

  try {
    const { token, scope } = await exchangeCodeForToken(shop, code);
    const auth = { shop, token, version: shopifyApiVersion(), source: "oauth" as const };
    let webhooks: string[] = [];
    let webhookNote = "";
    try {
      webhooks = await registerWebhooks(base, auth);
    } catch (err) {
      webhookNote = err instanceof Error ? err.message : String(err);
    }
    const installedAt = new Date();
    await saveConnection({ shop, token, scope, installedAt: installedAt.toISOString(), webhooks });
    await ensureStockBaseline(installedAt);
    await audit(db, { userId: user.id, action: "connect", entityType: "shopify", entityId: shop, summary: `Connected Shopify store ${shop} (${scope})${webhookNote ? ` · webhooks: ${webhookNote}` : ""}` });
    after(async () => {
      try {
        await syncShopify({ trigger: "install", full: true, sinceDays: 365 });
      } catch (err) {
        console.error("[shopify install] first sync failed:", err instanceof Error ? err.message : err);
      }
    });
    for (const p of ["/settings/shopify", "/orders", "/products", "/stock", "/sales", "/"]) revalidatePath(p);
    const res = NextResponse.redirect(`${base}/settings/shopify?connected=1${webhookNote ? `&warn=${encodeURIComponent(webhookNote)}` : ""}`);
    res.cookies.delete("shopify_oauth_state");
    return res;
  } catch (err) {
    return back(err instanceof Error ? err.message : "Could not complete the connection.");
  }
}
