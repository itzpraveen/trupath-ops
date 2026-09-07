export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const minutes = Number(process.env.SHOPIFY_SYNC_MINUTES ?? 0);
  if (!minutes || Number.isNaN(minutes)) return;
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler(minutes);
}
