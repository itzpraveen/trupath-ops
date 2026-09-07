import { syncShopify } from "@/lib/shopify";

function authorised(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization");
  const url = new URL(request.url);
  return header === `Bearer ${secret}` || url.searchParams.get("key") === secret;
}

async function handle(request: Request) {
  if (!authorised(request)) return Response.json({ error: "Unauthorised" }, { status: 401 });
  try {
    const result = await syncShopify({ trigger: "cron" });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
