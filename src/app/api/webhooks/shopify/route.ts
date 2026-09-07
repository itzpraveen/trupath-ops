import { after } from "next/server";
import { syncSingleOrder, syncSingleProduct, verifyShopifyWebhook } from "@/lib/shopify";

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyShopifyWebhook(raw, request.headers.get("x-shopify-hmac-sha256"))) {
    return new Response("Invalid signature", { status: 401 });
  }
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
        if (payload.id) await syncSingleOrder(String(payload.id));
      } else if (topic.startsWith("refunds/")) {
        if (payload.order_id) await syncSingleOrder(String(payload.order_id));
      } else if (topic.startsWith("products/")) {
        if (payload.id) await syncSingleProduct(String(payload.id));
      }
    } catch (err) {
      console.error(`[webhook ${topic}]`, err instanceof Error ? err.message : err);
    }
  });

  return new Response("ok", { status: 200 });
}
