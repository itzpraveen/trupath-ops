import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildAuthorizeUrl, getStore, isValidShop, storeCredentials } from "@/lib/shopify-oauth";

function appUrl(request: NextRequest) {
  return (process.env.APP_URL?.trim() || request.nextUrl.origin).replace(/\/$/, "");
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") return NextResponse.json({ error: "Only the owner can connect Shopify" }, { status: 403 });
  const base = appUrl(request);
  const back = (msg: string) => NextResponse.redirect(`${base}/settings/shopify?error=${encodeURIComponent(msg)}`);
  const store = await getStore(request.nextUrl.searchParams.get("store") ?? "");
  if (!store) return back("Choose a store first.");
  if (!isValidShop(store.shop)) return back(`"${store.shop}" is not a valid myshopify.com domain. Edit the store and fix it.`);
  const { clientId, clientSecret } = storeCredentials(store);
  if (!clientId || !clientSecret) return back(`Add the client ID and secret for ${store.label} first (Edit store).`);
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildAuthorizeUrl(store.shop, clientId, state, `${base}/api/shopify/callback`));
  res.cookies.set("shopify_oauth_state", `${state}:${store.id}`, { httpOnly: true, sameSite: "lax", secure: base.startsWith("https"), path: "/api/shopify", maxAge: 600 });
  return res;
}
