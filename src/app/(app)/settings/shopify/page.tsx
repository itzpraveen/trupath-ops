import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { disconnectShopify, pushAllStock, registerShopifyWebhooks, testShopify } from "@/actions/shopify";
import { db } from "@/db";
import { syncRuns } from "@/db/schema";
import { formatDate, formatDateTime } from "@/lib/dates";
import { getBrands, getCategories, getEntities } from "@/lib/queries/common";
import { listStores, missingScopes, shopifyApiVersion, storeCredentials, storeToken } from "@/lib/shopify-oauth";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/app/confirm-action";
import { InlineAction } from "@/components/app/inline-action";
import { Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCard, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/app/data-table";
import { SyncButton } from "../../orders/sync-button";
import { StoreDialog } from "./store-dialog";

export const metadata: Metadata = { title: "Shopify" };

export default async function ShopifySettingsPage(props: PageProps<"/settings/shopify">) {
  const sp = await props.searchParams;
  const [stores, runs, brands, entities, channels] = await Promise.all([listStores(), db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(12), getBrands(), getEntities(), getCategories("channel")]);
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") || "https://<your-app>.onrender.com";
  const minutes = Number(process.env.SHOPIFY_SYNC_MINUTES ?? 0);
  const notice =
    typeof sp.error === "string"
      ? { tone: "error", text: sp.error }
      : typeof sp.connected === "string"
        ? { tone: "ok", text: `${sp.connected} connected. The first sync of the last 12 months is running in the background.${typeof sp.warn === "string" ? ` Webhooks: ${sp.warn}` : ""}` }
        : typeof sp.updated === "string"
          ? { tone: "ok", text: `${sp.updated}: permissions updated.${typeof sp.warn === "string" ? ` Webhooks: ${sp.warn}` : ""}` }
          : null;
  const opts = { brands: brands.map((b) => ({ id: b.id, name: b.name })), entities: entities.map((e) => ({ id: e.id, name: e.name })), channels: channels.map((c) => c.name) };

  return (
    <div className="space-y-8">
      {notice ? <p className={`rounded-lg border px-4 py-3 text-sm ${notice.tone === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-success/30 bg-success/5 text-success"}`}>{notice.text}</p> : null}

      <Section title="Stores" description={`One card per Shopify store. Background sync ${minutes ? `every ${minutes} minutes` : "is off"}; webhooks deliver changes instantly. API version ${shopifyApiVersion()}.`} actions={<StoreDialog {...opts} />}>
        {stores.length === 0 ? <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">No stores yet. Add the store, paste its app credentials, then connect.</p> : null}
        <div className="grid gap-4 lg:grid-cols-2">
          {stores.map((store) => {
            const connected = !!storeToken(store) && store.active;
            const creds = storeCredentials(store);
            const hasCreds = !!(creds.clientId && creds.clientSecret);
            const missing = connected ? missingScopes(store.scope) : [];
            const brand = brands.find((b) => b.id === store.brandId)?.name ?? store.brandId;
            const entity = entities.find((e) => e.id === store.entityId)?.name ?? store.entityId;
            return (
              <div key={store.id} className="min-w-0 rounded-xl border bg-card p-4 text-sm">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold">{store.label}</p>
                    <p className="text-muted-foreground">{store.shop}</p>
                  </div>
                  {connected ? <StatusBadge tone="success">Connected</StatusBadge> : !store.active ? <StatusBadge tone="neutral">Inactive</StatusBadge> : hasCreds ? <StatusBadge tone="warning">Ready to connect</StatusBadge> : <StatusBadge tone="warning">Needs app credentials</StatusBadge>}
                </div>
                <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[9rem_minmax(0,1fr)] [&>dd]:min-w-0 [&>dd]:break-words">
                  <dt className="text-muted-foreground">Brand · books</dt>
                  <dd>
                    {brand} · {entity}
                  </dd>
                  <dt className="text-muted-foreground">Sales channel</dt>
                  <dd>{store.channel}</dd>
                  <dt className="text-muted-foreground">App credentials</dt>
                  <dd>{hasCreds ? `client id …${creds.clientId!.slice(-6)}` : "missing"}</dd>
                  {store.installedAt ? (
                    <>
                      <dt className="text-muted-foreground">Installed</dt>
                      <dd className="break-all">
                        {formatDate(store.installedAt)} · {(store.scope || "—").replace(/,/g, ", ")}
                      </dd>
                      <dt className="text-muted-foreground">Stock from</dt>
                      <dd>{store.baselineAt ? formatDate(store.baselineAt) : "—"} (orders before this never change stock)</dd>
                    </>
                  ) : null}
                  <dt className="text-muted-foreground">Webhooks</dt>
                  <dd>{store.webhooks.length ? store.webhooks.map((t) => t.toLowerCase().replace("_", "/")).join(", ") : connected ? "none registered yet" : "—"}</dd>
                  {connected ? (
                    <>
                      <dt className="text-muted-foreground">Permissions</dt>
                      <dd className="break-all">{missing.length ? <span className="text-warning">missing {missing.join(", ")}. Use the Update permissions button below.</span> : "all granted"}</dd>
                      <dt className="text-muted-foreground">Website stock</dt>
                      <dd>{store.pushInventory ? "kept in sync from this app" : "not pushed (turn on in Edit store after counting stock)"}</dd>
                    </>
                  ) : null}
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  {connected && missing.length ? (
                    <a href={`/api/shopify/install?store=${store.id}`} className={buttonVariants({ size: "sm" })}>
                      Update permissions
                    </a>
                  ) : null}
                  <StoreDialog store={store} hasOwnSecret={!!store.clientSecretEnc} {...opts} />
                  {connected ? (
                    <>
                      <InlineAction action={testShopify} hidden={{ storeId: store.id }} variant="outline" size="sm">
                        Test
                      </InlineAction>
                      <SyncButton label="Sync recent" storeId={store.id} variant={missing.length ? "outline" : "default"} />
                      <SyncButton label="Full sync (12 months)" storeId={store.id} full />
                      <InlineAction action={registerShopifyWebhooks} hidden={{ storeId: store.id }} variant="outline" size="sm">
                        Register webhooks
                      </InlineAction>
                      <ConfirmAction trigger={<Button variant="outline" size="sm" />} title={`Push all stock to ${store.label}?`} description="Sets the website's available quantity for every product of this brand to the stock shown in this app. Products at 0 here will show as sold out on the website." action={pushAllStock} hidden={{ storeId: store.id }} confirmLabel="Push stock">
                        Push all stock
                      </ConfirmAction>
                      <ConfirmAction trigger={<Button variant="ghost" size="sm" className="text-destructive" />} title={`Disconnect ${store.label}?`} description="Syncing stops until you connect again. Orders already synced stay in the books." action={disconnectShopify} hidden={{ storeId: store.id }} confirmLabel="Disconnect" destructive>
                        Disconnect
                      </ConfirmAction>
                    </>
                  ) : hasCreds && store.active ? (
                    <a href={`/api/shopify/install?store=${store.id}`} className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80">
                      Connect to Shopify
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Recent syncs">
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Variants</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 ? (
                <TableEmpty colSpan={7}>No syncs yet.</TableEmpty>
              ) : (
                runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(r.startedAt)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{stores.find((s) => s.shop === r.shop)?.label ?? r.shop ?? "—"}</TableCell>
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

      <Section title="How to connect a store" description="Done once per store, in the Shopify Dev Dashboard of the account that owns that store.">
        <ol className="list-decimal space-y-3 rounded-xl border bg-card p-4 pl-8 text-sm">
          <li>
            At dev.shopify.com create an app. In its version form set <span className="font-medium">App URL</span> to <code className="rounded bg-muted px-1">{appUrl}</code>, untick <span className="font-medium">Embed app in Shopify admin</span>, and choose webhooks API version <span className="font-medium">{shopifyApiVersion()}</span>.
          </li>
          <li>
            Under <span className="font-medium">API access → Scopes</span> enter <code className="rounded bg-muted px-1">read_orders, read_all_orders, read_products, read_inventory, write_inventory, read_locations, read_customers, read_merchant_managed_fulfillment_orders, write_merchant_managed_fulfillment_orders</code> and add <code className="rounded bg-muted px-1">{appUrl}/api/shopify/callback</code> under allowed redirection URLs. Press <span className="font-medium">Release</span>.
          </li>
          <li>Request <span className="font-medium">Protected customer data access</span> (customer data plus name, address, email, phone) and set <span className="font-medium">Distribution</span> to custom distribution for that store&apos;s myshopify.com domain.</li>
          <li>Copy the app&apos;s client ID and client secret into the store card here (Add store or Edit store).</li>
          <li>
            Press <span className="font-medium">Connect to Shopify</span> and approve the install. Do this from a network that can open myshopify.com addresses. Orders from the last 12 months sync in the background and webhooks are registered.
          </li>
        </ol>
      </Section>
    </div>
  );
}
