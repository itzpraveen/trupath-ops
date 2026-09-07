import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { syncRuns } from "@/db/schema";
import { formatDateTime } from "@/lib/dates";
import { shopifyConfig } from "@/lib/shopify";
import { Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCard, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/app/data-table";
import { SyncButton } from "../../orders/sync-button";
import { TestConnectionButton } from "./test-button";

export const metadata: Metadata = { title: "Shopify" };

export default async function ShopifySettingsPage() {
  const cfg = shopifyConfig();
  const runs = await db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(10);
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") || "https://<your-app>.onrender.com";
  const minutes = Number(process.env.SHOPIFY_SYNC_MINUTES ?? 0);
  const webhookSecretSet = !!process.env.SHOPIFY_WEBHOOK_SECRET;

  return (
    <div className="space-y-8">
      <Section title="Connection" description="Credentials live in the server's environment variables, never in the database.">
        <div className="rounded-xl border bg-card p-4 text-sm">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted-foreground">Status</dt>
            <dd>{cfg.configured ? <StatusBadge tone="success">Connected</StatusBadge> : <StatusBadge tone="warning">Not connected</StatusBadge>}</dd>
            <dt className="text-muted-foreground">Store</dt>
            <dd>{cfg.domain ?? "SHOPIFY_STORE_DOMAIN not set"}</dd>
            <dt className="text-muted-foreground">Admin API token</dt>
            <dd>{cfg.token ? `set (…${cfg.token.slice(-4)})` : "SHOPIFY_ADMIN_TOKEN not set"}</dd>
            <dt className="text-muted-foreground">Webhook secret</dt>
            <dd>{webhookSecretSet ? "set" : "SHOPIFY_WEBHOOK_SECRET not set (webhooks will be rejected)"}</dd>
            <dt className="text-muted-foreground">API version</dt>
            <dd>{cfg.version}</dd>
            <dt className="text-muted-foreground">Background sync</dt>
            <dd>{minutes ? `every ${minutes} minutes while the server runs` : "off (SHOPIFY_SYNC_MINUTES=0)"}</dd>
            <dt className="text-muted-foreground">Webhook URL</dt>
            <dd className="break-all font-mono text-xs">{appUrl}/api/webhooks/shopify</dd>
          </dl>
          {cfg.configured ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <TestConnectionButton />
              <SyncButton label="Sync recent orders" variant="default" />
              <SyncButton label="Full sync (last 12 months)" full />
            </div>
          ) : null}
        </div>
      </Section>

      <Section title="Recent syncs">
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Variants</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 ? (
                <TableEmpty colSpan={6}>No syncs yet.</TableEmpty>
              ) : (
                runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(r.startedAt)}</TableCell>
                    <TableCell>{r.trigger}</TableCell>
                    <TableCell>
                      <StatusBadge tone={r.status === "ok" ? "success" : r.status === "error" ? "destructive" : "info"}>{r.status}</StatusBadge>
                    </TableCell>
                    <TableCell className="tabular text-right">{r.ordersUpserted}</TableCell>
                    <TableCell className="tabular text-right">{r.productsUpserted}</TableCell>
                    <TableCell className="max-w-72 truncate text-xs text-muted-foreground">{r.message ?? ""}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableCard>
      </Section>

      <Section title="How to connect" description="Takes about ten minutes in the Shopify admin. Each step depends on the one before.">
        <ol className="list-decimal space-y-3 rounded-xl border bg-card p-4 pl-8 text-sm">
          <li>
            In Shopify admin open <span className="font-medium">Settings → Apps and sales channels → Develop apps</span> and create an app called <span className="font-medium">TruPath Ops</span>.
          </li>
          <li>
            Under <span className="font-medium">Configuration → Admin API integration</span> tick these scopes: <code className="rounded bg-muted px-1">read_orders</code>, <code className="rounded bg-muted px-1">read_all_orders</code> (for orders older than 60 days), <code className="rounded bg-muted px-1">read_products</code>, <code className="rounded bg-muted px-1">read_inventory</code>, <code className="rounded bg-muted px-1">read_customers</code>. Save.
          </li>
          <li>
            Click <span className="font-medium">Install app</span>, then reveal and copy the <span className="font-medium">Admin API access token</span> (starts with shpat_). It is shown only once.
          </li>
          <li>
            On the server (Render → your service → Environment) set <code className="rounded bg-muted px-1">SHOPIFY_STORE_DOMAIN</code> to the store&apos;s myshopify.com domain and <code className="rounded bg-muted px-1">SHOPIFY_ADMIN_TOKEN</code> to the token. Save, wait for the redeploy, then come back here and press <span className="font-medium">Test connection</span> and <span className="font-medium">Full sync</span>.
          </li>
          <li>
            For instant updates, open <span className="font-medium">Settings → Notifications → Webhooks</span> and create webhooks (format JSON, latest API version) for <span className="font-medium">Order creation, Order update, Order cancellation, Refund creation, Product update</span>, all pointing to the webhook URL above.
          </li>
          <li>
            At the bottom of that Webhooks page copy the signing secret and set it as <code className="rounded bg-muted px-1">SHOPIFY_WEBHOOK_SECRET</code>. Without it, webhook calls are ignored and only the periodic sync runs.
          </li>
        </ol>
      </Section>
    </div>
  );
}
