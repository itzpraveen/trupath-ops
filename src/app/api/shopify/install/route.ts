import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildAuthorizeUrl, isValidShop, oauthClient } from "@/lib/shopify-oauth";

function appUrl(request: NextRequest) {
  return (process.env.APP_URL?.trim() || request.nextUrl.origin).replace(/\/$/, "");
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") return NextResponse.json({ error: "Only the owner can connect Shopify" }, { status: 403 });
  const base = appUrl(request);
  const back = (msg: string) => NextResponse.redirect(`${base}/settings/shopify?error=${encodeURIComponent(msg)}`);
  const { clientId, clientSecret } = oauthClient();
  if (!clientId || !clientSecret) return back("Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET on the server first.");
  const shop = (request.nextUrl.searchParams.get("shop") || process.env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  if (!isValidShop(shop)) return back("Enter the store's myshopify.com domain, for example jedtmv-0e.myshopify.com.");
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildAuthorizeUrl(shop, state, `${base}/api/shopify/callback`));
  res.cookies.set("shopify_oauth_state", `${state}:${shop}`, { httpOnly: true, sameSite: "lax", secure: base.startsWith("https"), path: "/api/shopify", maxAge: 600 });
  return res;
}
