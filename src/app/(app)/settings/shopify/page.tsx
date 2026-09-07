import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { disconnectShopify, registerShopifyWebhooks } from "@/actions/shopify";
import { db } from "@/db";
import { syncRuns } from "@/db/schema";
import { formatDate, formatDateTime } from "@/lib/dates";
import { shopifyStatus } from "@/lib/shopify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmAction } from "@/components/app/confirm-action";
import { InlineAction } from "@/components/app/inline-action";
import { Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCard, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/app/data-table";
import { SyncButton } from "../../orders/sync-button";
import { TestConnectionButton } from "./test-button";

export const metadata: Metadata = { title: "Shopify" };

export default async function ShopifySettingsPage(props: PageProps<"/settings/shopify">) {
  const sp = await props.searchParams;
  const st = await shopifyStatus();
  const runs = await db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(10);
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") || "https://<your-app>.onrender.com";
  const minutes = Number(process.env.SHOPIFY_SYNC_MINUTES ?? 0);
  const canOAuth = st.clientIdSet && st.clientSecretSet;
  const notice = typeof sp.error === "string" ? { tone: "error", text: sp.error } : sp.connected === "1" ? { tone: "ok", text: `Connected. The first sync of the last 12 months is running in the background.${typeof sp.warn === "string" ? ` Webhooks: ${sp.warn}` : ""}` } : null;

  return (
    <div className="space-y-8">
      {notice ? (
        <p className={`rounded-lg border px-4 py-3 text-sm ${notice.tone === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-success/30 bg-success/5 text-success"}`}>{notice.text}</p>
      ) : null}

      <Section title="Connection" description="Secrets stay in the server's environment; the store token from an install is stored encrypted.">
        <div className="rounded-xl border bg-card p-4 text-sm">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[11rem_1fr]">
            <dt className="text-muted-foreground">Status</dt>
            <dd>{st.configured ? <StatusBadge tone="success">Connected{st.source === "env" ? " (manual token)" : ""}</StatusBadge> : <StatusBadge tone="warning">Not connected</StatusBadge>}</dd>
            <dt className="text-muted-foreground">Store</dt>
            <dd>{st.shop ?? "not set"}</dd>
            {st.installedAt ? (
              <>
                <dt className="text-muted-foreground">Installed</dt>
                <dd>{formatDate(st.installedAt)} · scopes {st.scope || "—"}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Webhooks</dt>
            <dd>{st.webhooks.length ? st.webhooks.map((t) => t.toLowerCase().replace("_", "/")).join(", ") : st.configured ? "none registered yet" : "—"}</dd>
            <dt className="text-muted-foreground">App credentials</dt>
            <dd>{canOAuth ? "client id and secret set" : `missing ${[!st.clientIdSet && "SHOPIFY_CLIENT_ID", !st.clientSecretSet && "SHOPIFY_CLIENT_SECRET"].filter(Boolean).join(" and ")}`}</dd>
            <dt className="text-muted-foreground">API version</dt>
            <dd>{st.version}</dd>
            <dt className="text-muted-foreground">Background sync</dt>
            <dd>{minutes ? `every ${minutes} minutes while the server runs` : "off (SHOPIFY_SYNC_MINUTES=0)"}</dd>
            <dt className="text-muted-foreground">Webhook URL</dt>
            <dd className="break-all font-mono text-xs">{appUrl}/api/webhooks/shopify</dd>
            <dt className="text-muted-foreground">Redirect URL</dt>
            <dd className="break-all font-mono text-xs">{appUrl}/api/shopify/callback</dd>
          </dl>

          {st.configured ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <TestConnectionButton />
              <SyncButton label="Sync recent orders" variant="default" />
              <SyncButton label="Full sync (last 12 months)" />
              {st.source === "oauth" ? (
                <>
                  <InlineAction action={registerShopifyWebhooks} hidden={{}} variant="outline" size="sm">
                    Register webhooks
                  </InlineAction>
                  <ConfirmAction trigger={<Button variant="ghost" size="sm" className="text-destructive" />} title="Disconnect Shopify?" description="Syncing stops until you connect again. Orders already synced stay in the books." action={disconnectShopify} confirmLabel="Disconnect" destructive>
                    Disconnect
                  </ConfirmAction>
                </>
              ) : null}
            </div>
          ) : canOAuth ? (
            <form action="/api/shopify/install" method="get" className="mt-4 flex flex-wrap items-end gap-2">
              <div className="space-y-1.5">
                <label htmlFor="shop" className="text-sm font-medium">Store domain</label>
                <Input id="shop" name="shop" defaultValue={st.shop ?? "jedtmv-0e.myshopify.com"} className="w-72" required />
              </div>
              <Button type="submit">Connect to Shopify</Button>
            </form>
          ) : (
            <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">Add the app credentials to the server environment (steps below), redeploy, and a Connect button appears here.</p>
          )}
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
                    <TableCell className="max-w-72 truncate text-xs text-muted-foreground" title={r.message ?? ""}>{r.message ?? ""}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableCard>
      </Section>

      <Section title="How to connect" description="Using an app created at dev.shopify.com. Each step depends on the one before.">
        <ol className="list-decimal space-y-3 rounded-xl border bg-card p-4 pl-8 text-sm">
          <li>
            In the Dev Dashboard app&apos;s version form set <span className="font-medium">App URL</span> to <code className="rounded bg-muted px-1">{appUrl}</code>, untick <span className="font-medium">Embed app in Shopify admin</span>, and choose webhooks API version <span className="font-medium">{st.version}</span>.
          </li>
          <li>
            Under <span className="font-medium">API access → Scopes</span> enter <code className="rounded bg-muted px-1">read_orders, read_all_orders, read_products, read_inventory, read_customers</code>, tick <span className="font-medium">Use legacy install flow</span>, and add <code className="rounded bg-muted px-1">{appUrl}/api/shopify/callback</code> under allowed redirection URLs. Press <span className="font-medium">Release</span>.
          </li>
          <li>
            In <span className="font-medium">App settings → Protected customer data access</span> request customer data plus name, address, email and phone (needed to see who ordered and where to ship) and save.
          </li>
          <li>
            In <span className="font-medium">Distribution</span> choose custom distribution and enter the store domain <code className="rounded bg-muted px-1">{st.shop ?? "jedtmv-0e.myshopify.com"}</code>.
          </li>
          <li>
            From <span className="font-medium">App settings</span> copy the client ID and client secret. On Render (service → Environment) set <code className="rounded bg-muted px-1">SHOPIFY_CLIENT_ID</code>, <code className="rounded bg-muted px-1">SHOPIFY_CLIENT_SECRET</code> and <code className="rounded bg-muted px-1">SHOPIFY_STORE_DOMAIN</code>, save, and wait for the redeploy.
          </li>
          <li>
            Come back here and press <span className="font-medium">Connect to Shopify</span>. Approve the install; orders from the last 12 months sync in the background and webhooks are registered for instant updates.
          </li>
        </ol>
      </Section>
    </div>
  );
}
