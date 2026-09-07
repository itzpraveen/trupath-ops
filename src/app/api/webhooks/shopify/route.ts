import { after } from "next/server";
import { syncSingleOrder, syncSingleProduct, verifyShopifyWebhook } from "@/lib/shopify";
import { getStoreByShop, storeAuth, storeCredentials } from "@/lib/shopify-oauth";

export async function POST(request: Request) {
  const raw = await request.text();
  const shop = (request.headers.get("x-shopify-shop-domain") ?? "").toLowerCase();
  const store = shop ? await getStoreByShop(shop) : null;
  const secrets = [store ? storeCredentials(store).clientSecret : null, process.env.SHOPIFY_WEBHOOK_SECRET?.trim(), process.env.SHOPIFY_CLIENT_SECRET?.trim()];
  if (!verifyShopifyWebhook(raw, request.headers.get("x-shopify-hmac-sha256"), secrets)) {
    return new Response("Invalid signature", { status: 401 });
  }
  const auth = store ? storeAuth(store) : null;
  if (!auth) return new Response("Store not connected", { status: 200 });
  const topic = request.headers.get("x-shopify-topic") ?? "";
  let payload: { id?: number | string; order_id?: number | string } = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  after(async () => {
    try {
      if (topic.startsWith("orders/")) {
        if (payload.id) await syncSingleOrder(String(payload.id), auth);
      } else if (topic.startsWith("refunds/")) {
        if (payload.order_id) await syncSingleOrder(String(payload.order_id), auth);
      } else if (topic.startsWith("products/")) {
        if (payload.id) await syncSingleProduct(String(payload.id), auth);
      }
    } catch (err) {
      console.error(`[webhook ${topic} ${shop}]`, err instanceof Error ? err.message : err);
    }
  });

  return new Response("ok", { status: 200 });
}
