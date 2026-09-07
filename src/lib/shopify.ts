import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { listConnectedAuths, setStoreWebhooks, WEBHOOK_TOPICS, type StoreAuth } from "@/lib/shopify-oauth";
import { desc, eq, isNull, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { businessRecords, products, shopifyOrders, syncRuns, type ShopifyLine } from "@/db/schema";
import { adjustStock } from "@/lib/stock";
import { toPaise } from "@/lib/money";
import { toYmd } from "@/lib/dates";

/* ------------------------------------------------------------------ */
/* Config & client                                                     */
/* ------------------------------------------------------------------ */

export type { StoreAuth } from "@/lib/shopify-oauth";
export { shopifyApiVersion } from "@/lib/shopify-oauth";

export async function isShopifyConfigured() {
  return (await listConnectedAuths()).length > 0;
}

/** The first connected store (used where a single default is enough, e.g. the settings test). */
export async function getShopifyAuth(): Promise<StoreAuth | null> {
  return (await listConnectedAuths())[0] ?? null;
}

type GraphQLResponse<T> = { data?: T; errors?: Array<{ message: string; extensions?: { code?: string } }> };

function friendlyShopifyError(messages: string[]) {
  const text = messages.join("; ");
  if (/protected customer data/i.test(text)) {
    return "Shopify blocked customer fields: in the Dev Dashboard open the app → Protected customer data access, request access to customer data plus name, address, email and phone, save, then sync again.";
  }
  if (/access denied|not approved|scope/i.test(text)) return `Shopify refused the request (${text}). Check the app's scopes and reinstall from Settings → Shopify.`;
  return `Shopify error: ${text}`;
}

export async function shopifyGraphQL<T>(query: string, variables: Record<string, unknown>, auth: StoreAuth, attempt = 0): Promise<T> {
  const res = await fetch(`https://${auth.shop}/admin/api/${auth.version}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": auth.token },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (res.status === 429 && attempt < 4) {
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    return shopifyGraphQL<T>(query, variables, auth, attempt + 1);
  }
  if (res.status === 401 || res.status === 403) throw new Error(`${auth.label}: Shopify rejected the access token. Reconnect the store from Settings → Shopify.`);
  if (!res.ok) throw new Error(`${auth.label}: Shopify returned HTTP ${res.status}`);
  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    if (json.errors.some((e) => e.extensions?.code === "THROTTLED") && attempt < 4) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      return shopifyGraphQL<T>(query, variables, auth, attempt + 1);
    }
    throw new Error(`${auth.label}: ${friendlyShopifyError(json.errors.map((e) => e.message))}`);
  }
  if (!json.data) throw new Error(`${auth.label}: Shopify returned no data`);
  return json.data;
}

/** Webhooks registered by an app are signed with that app's client secret. */
export function verifyShopifyWebhook(rawBody: string, hmacHeader: string | null, secrets: Array<string | null | undefined>): boolean {
  if (!hmacHeader) return false;
  const given = Buffer.from(hmacHeader);
  return secrets
    .filter((s): s is string => !!s)
    .some((secret) => {
      const digest = Buffer.from(createHmac("sha256", secret).update(rawBody, "utf8").digest("base64"));
      return digest.length === given.length && timingSafeEqual(digest, given);
    });
}

/** Make sure the store sends us the events we rely on. Returns the topics now subscribed to our URL. */
export async function registerWebhooks(appUrl: string, auth: StoreAuth): Promise<string[]> {
  const callback = `${appUrl.replace(/\/$/, "")}/api/webhooks/shopify`;
  const existing: { webhookSubscriptions: { nodes: Array<{ id: string; topic: string; endpoint: { __typename: string; callbackUrl?: string } }> } } = await shopifyGraphQL(
    `{ webhookSubscriptions(first: 100) { nodes { id topic endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } } } } }`,
    {},
    auth,
  );
  const have = new Set(existing.webhookSubscriptions.nodes.filter((n) => n.endpoint?.callbackUrl === callback).map((n) => n.topic));
  for (const topic of WEBHOOK_TOPICS) {
    if (have.has(topic)) continue;
    const r: { webhookSubscriptionCreate: { webhookSubscription: { id: string } | null; userErrors: Array<{ message: string }> } } = await shopifyGraphQL(
      `mutation Register($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) { webhookSubscription { id } userErrors { message } }
      }`,
      { topic, sub: { uri: callback, format: "JSON" } },
      auth,
    );
    if (r.webhookSubscriptionCreate.userErrors.length) throw new Error(`Could not register ${topic}: ${r.webhookSubscriptionCreate.userErrors.map((e) => e.message).join(", ")}`);
    have.add(topic);
  }
  return WEBHOOK_TOPICS.filter((t) => have.has(t));
}

export const gidToId = (gid: string | null | undefined) => (gid ? gid.split("/").pop() ?? null : null);

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

type Money = { shopMoney: { amount: string; currencyCode?: string } };
type OrderNode = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  closedAt: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  tags: string[];
  note: string | null;
  email: string | null;
  phone: string | null;
  paymentGatewayNames: string[];
  shippingAddress: { name: string | null; address1: string | null; address2: string | null; city: string | null; province: string | null; provinceCode: string | null; zip: string | null; country: string | null; phone: string | null } | null;
  billingAddress: { name: string | null } | null;
  totalPriceSet: Money;
  subtotalPriceSet: Money | null;
  totalDiscountsSet: Money | null;
  totalTaxSet: Money | null;
  totalShippingPriceSet: Money;
  totalRefundedSet: Money;
  refunds: Array<{ id: string; createdAt: string; totalRefundedSet: Money }>;
  lineItems: {
    nodes: Array<{
      id: string;
      title: string;
      variantTitle: string | null;
      sku: string | null;
      quantity: number;
      currentQuantity: number;
      variant: { id: string } | null;
      product: { id: string } | null;
      originalUnitPriceSet: Money;
      totalDiscountSet: Money;
    }>;
  };
};

const ORDER_FIELDS = `
  id name createdAt updatedAt processedAt cancelledAt cancelReason closedAt
  displayFinancialStatus displayFulfillmentStatus tags note email phone paymentGatewayNames
  shippingAddress { name address1 address2 city province provinceCode zip country phone }
  billingAddress { name }
  totalPriceSet { shopMoney { amount currencyCode } }
  subtotalPriceSet { shopMoney { amount } }
  totalDiscountsSet { shopMoney { amount } }
  totalTaxSet { shopMoney { amount } }
  totalShippingPriceSet { shopMoney { amount } }
  totalRefundedSet { shopMoney { amount } }
  refunds { id createdAt totalRefundedSet { shopMoney { amount } } }
  lineItems(first: 60) {
    nodes {
      id title variantTitle sku quantity currentQuantity
      variant { id } product { id }
      originalUnitPriceSet { shopMoney { amount } }
      totalDiscountSet { shopMoney { amount } }
    }
  }
`;

async function* iterateOrders(query: string, auth: StoreAuth) {
  let after: string | null = null;
  for (;;) {
    const data: { orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: OrderNode[] } } = await shopifyGraphQL(
      `query Orders($first: Int!, $after: String, $query: String) {
        orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
          pageInfo { hasNextPage endCursor }
          nodes { ${ORDER_FIELDS} }
        }
      }`,
      { first: 25, after, query },
      auth,
    );
    for (const node of data.orders.nodes) yield node;
    if (!data.orders.pageInfo.hasNextPage) break;
    after = data.orders.pageInfo.endCursor;
  }
}

export async function fetchOrderById(numericId: string, auth: StoreAuth): Promise<OrderNode | null> {
  const data: { order: OrderNode | null } = await shopifyGraphQL(`query Order($id: ID!) { order(id: $id) { ${ORDER_FIELDS} } }`, { id: `gid://shopify/Order/${numericId}` }, auth);
  return data.order;
}

type ProductNode = {
  id: string;
  title: string;
  productType: string | null;
  status: string;
  featuredMedia: { preview: { image: { url: string } | null } | null } | null;
  variants: { nodes: Array<{ id: string; title: string; sku: string | null; price: string; inventoryQuantity: number | null; image: { url: string } | null }> };
};

async function* iterateProducts(auth: StoreAuth) {
  let after: string | null = null;
  for (;;) {
    const data: { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ProductNode[] } } = await shopifyGraphQL(
      `query Products($first: Int!, $after: String) {
        products(first: $first, after: $after, sortKey: TITLE) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id title productType status
            featuredMedia { preview { image { url } } }
            variants(first: 100) { nodes { id title sku price inventoryQuantity image { url } } }
          }
        }
      }`,
      { first: 50, after },
      auth,
    );
    for (const node of data.products.nodes) yield node;
    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }
}

export async function fetchProductById(numericId: string, auth: StoreAuth): Promise<ProductNode | null> {
  const data: { product: ProductNode | null } = await shopifyGraphQL(
    `query Product($id: ID!) { product(id: $id) { id title productType status featuredMedia { preview { image { url } } } variants(first: 100) { nodes { id title sku price inventoryQuantity image { url } } } } }`,
    { id: `gid://shopify/Product/${numericId}` },
    auth,
  );
  return data.product;
}

/* ------------------------------------------------------------------ */
/* Upserts                                                             */
/* ------------------------------------------------------------------ */

const money = (m: Money | null | undefined) => (m ? toPaise(m.shopMoney.amount) : 0);

export async function upsertProductFromShopify(node: ProductNode, auth: StoreAuth) {
  let n = 0;
  for (const v of node.variants.nodes) {
    const variantId = gidToId(v.id)!;
    const values = {
      brandId: auth.brandId,
      name: node.title.trim(),
      variant: v.title === "Default Title" ? "" : v.title.trim(),
      sku: v.sku?.trim() || null,
      category: node.productType?.trim() || null,
      shopifyProductId: gidToId(node.id),
      shopifyVariantId: variantId,
      imageUrl: v.image?.url ?? node.featuredMedia?.preview?.image?.url ?? null,
      priceP: toPaise(v.price),
      shopifyQty: v.inventoryQuantity ?? null,
      source: "shopify" as const,
      active: node.status === "ACTIVE",
    };
    await db
      .insert(products)
      .values(values)
      .onConflictDoUpdate({
        target: products.shopifyVariantId,
        set: {
          brandId: values.brandId,
          name: values.name,
          variant: values.variant,
          sku: values.sku,
          category: values.category,
          shopifyProductId: values.shopifyProductId,
          imageUrl: values.imageUrl,
          priceP: values.priceP,
          shopifyQty: values.shopifyQty,
          active: values.active,
        },
      });
    n++;
  }
  return n;
}

function mapLines(node: OrderNode): ShopifyLine[] {
  return node.lineItems.nodes.map((li) => ({
    id: gidToId(li.id) ?? li.id,
    title: li.title,
    variantTitle: li.variantTitle,
    sku: li.sku,
    variantId: gidToId(li.variant?.id),
    productId: gidToId(li.product?.id),
    quantity: li.currentQuantity ?? li.quantity,
    priceP: money(li.originalUnitPriceSet),
    discountP: money(li.totalDiscountSet),
  }));
}

/** Store the order and apply its effects on sales records and finished stock (idempotent). */
export async function upsertOrderFromShopify(node: OrderNode, auth: StoreAuth) {
  const id = gidToId(node.id)!;
  const lines = mapLines(node);
  const gateway = node.paymentGatewayNames?.[0] ?? null;
  const customerName = node.shippingAddress?.name || node.billingAddress?.name || node.email || "Guest";
  const orderNumber = Number(node.name.replace(/\D/g, "")) || null;
  const row = {
    id,
    name: node.name,
    orderNumber,
    createdAtShop: new Date(node.createdAt),
    updatedAtShop: new Date(node.updatedAt),
    financialStatus: node.displayFinancialStatus ?? "",
    fulfillmentStatus: node.displayFulfillmentStatus ?? "",
    customerName,
    email: node.email,
    phone: node.phone ?? node.shippingAddress?.phone ?? null,
    shippingAddress: node.shippingAddress ?? null,
    city: node.shippingAddress?.city ?? null,
    province: node.shippingAddress?.province ?? null,
    totalP: money(node.totalPriceSet),
    subtotalP: money(node.subtotalPriceSet),
    discountP: money(node.totalDiscountsSet),
    shippingP: money(node.totalShippingPriceSet),
    taxP: money(node.totalTaxSet),
    refundedP: money(node.totalRefundedSet),
    currency: node.totalPriceSet.shopMoney.currencyCode ?? "INR",
    gateway,
    tags: (node.tags ?? []).join(", "),
    cancelledAt: node.cancelledAt ? new Date(node.cancelledAt) : null,
    cancelReason: node.cancelReason,
    closedAt: node.closedAt ? new Date(node.closedAt) : null,
    lineItems: lines,
    shop: auth.shop,
    brandId: auth.brandId,
    entityId: auth.entityId,
    note: node.note,
    syncedAt: new Date(),
  };

  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(shopifyOrders).where(eq(shopifyOrders.id, id)).for("update");
    if (existing) {
      const { id: _id, ...rest } = row;
      void _id;
      await tx.update(shopifyOrders).set(rest).where(eq(shopifyOrders.id, id));
    } else {
      await tx.insert(shopifyOrders).values(row);
    }

    const workDate = toYmd(new Date(node.processedAt ?? node.createdAt));
    const isCod = (node.paymentGatewayNames ?? []).some((g) => /cash|cod|delivery/i.test(g));
    const cancelled = !!node.cancelledAt || node.displayFinancialStatus === "VOIDED";
    const saleRef = `shopify:order:${id}:sale`;

    // Sale record (one per order)
    const [sale] = await tx.select().from(businessRecords).where(eq(businessRecords.sourceRef, saleRef)).limit(1);
    if (cancelled) {
      if (sale && !sale.voidedAt) {
        await tx.update(businessRecords).set({ voidedAt: new Date(), voidReason: "Cancelled on Shopify" }).where(eq(businessRecords.id, sale.id));
      }
    } else if (!sale) {
      await tx.insert(businessRecords).values({
        entityId: auth.entityId,
        kind: "sale",
        workDate,
        amountP: row.totalP,
        channel: auth.channel,
        category: "Website order",
        reference: node.name,
        paymentMethod: isCod ? "cod" : "gateway",
        paymentTerms: node.displayFinancialStatus === "PAID" || node.displayFinancialStatus === "PARTIALLY_REFUNDED" || node.displayFinancialStatus === "REFUNDED" ? "paid" : "credit",
        source: "shopify",
        sourceRef: saleRef,
        shopifyOrderId: id,
        note: customerName,
      });
    } else if (!sale.voidedAt) {
      await tx
        .update(businessRecords)
        .set({
          amountP: row.totalP,
          workDate,
          reference: node.name,
          paymentMethod: isCod ? "cod" : "gateway",
          paymentTerms: node.displayFinancialStatus === "PAID" || node.displayFinancialStatus === "PARTIALLY_REFUNDED" || node.displayFinancialStatus === "REFUNDED" ? "paid" : "credit",
        })
        .where(eq(businessRecords.id, sale.id));
    }

    // Refunds -> return records (one per refund)
    for (const refund of node.refunds ?? []) {
      const amount = money(refund.totalRefundedSet);
      if (amount <= 0) continue;
      const ref = `shopify:refund:${gidToId(refund.id)}`;
      await tx
        .insert(businessRecords)
        .values({
          entityId: auth.entityId,
          kind: "return",
          workDate: toYmd(new Date(refund.createdAt)),
          amountP: amount,
          channel: auth.channel,
          category: "Website refund",
          reference: node.name,
          paymentMethod: isCod ? "cod" : "gateway",
          source: "shopify",
          sourceRef: ref,
          shopifyOrderId: id,
          note: customerName,
        })
        .onConflictDoNothing({ target: businessRecords.sourceRef });
    }

    // Finished stock: deduct once when fulfilled, put back once when cancelled/restocked.
    // Orders placed before the stock baseline (when the store was connected) never touch stock,
    // because the quantities on hand at that time were not in the system.
    const baseline = auth.baselineAt;
    const touchesStock = !baseline || new Date(node.createdAt) >= baseline;
    const fulfilled = touchesStock && node.displayFulfillmentStatus === "FULFILLED";
    const restocked = touchesStock && (node.displayFulfillmentStatus === "RESTOCKED" || cancelled);
    const stockDeducted = existing?.stockDeducted ?? false;
    const stockRestored = existing?.stockRestored ?? false;
    if (fulfilled && !stockDeducted) {
      for (const line of lines) {
        if (!line.variantId || line.quantity <= 0) continue;
        const [p] = await tx.select({ id: products.id }).from(products).where(eq(products.shopifyVariantId, line.variantId)).limit(1);
        if (!p) continue;
        await adjustStock(tx, { productId: p.id, kind: "sale_out", qty: -line.quantity, refType: "shopify_order", refId: node.name, note: `Website order ${node.name}`, allowNegative: true });
      }
      await tx.update(shopifyOrders).set({ stockDeducted: true }).where(eq(shopifyOrders.id, id));
    } else if (restocked && stockDeducted && !stockRestored) {
      for (const line of lines) {
        if (!line.variantId || line.quantity <= 0) continue;
        const [p] = await tx.select({ id: products.id }).from(products).where(eq(products.shopifyVariantId, line.variantId)).limit(1);
        if (!p) continue;
        await adjustStock(tx, { productId: p.id, kind: "return_in", qty: line.quantity, refType: "shopify_order", refId: node.name, note: `Restocked from ${node.name}` });
      }
      await tx.update(shopifyOrders).set({ stockRestored: true }).where(eq(shopifyOrders.id, id));
    }
  });
}

/* ------------------------------------------------------------------ */
/* Sync orchestration                                                  */
/* ------------------------------------------------------------------ */

const running = { current: false };

export async function getLastSync(shop?: string) {
  const where = shop ? eq(syncRuns.shop, shop) : undefined;
  const [run] = await db.select().from(syncRuns).where(where).orderBy(desc(syncRuns.startedAt)).limit(1);
  const [lastOk] = await db
    .select()
    .from(syncRuns)
    .where(shop ? and(eq(syncRuns.status, "ok"), eq(syncRuns.shop, shop)) : eq(syncRuns.status, "ok"))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);
  return { last: run ?? null, lastOk: lastOk ?? null };
}

async function syncStore(auth: StoreAuth, opts: { trigger?: string; sinceDays?: number; full?: boolean }) {
  const [run] = await db.insert(syncRuns).values({ trigger: opts.trigger ?? "manual", shop: auth.shop }).returning();
  let ordersUpserted = 0;
  let productsUpserted = 0;
  try {
    const { lastOk } = await getLastSync(auth.shop);
    let since: Date;
    if (opts.full) since = new Date(Date.now() - (opts.sinceDays ?? 60) * 86_400_000);
    else if (lastOk) since = new Date(lastOk.startedAt.getTime() - 2 * 3_600_000);
    else since = new Date(Date.now() - (opts.sinceDays ?? 30) * 86_400_000);

    for await (const node of iterateProducts(auth)) productsUpserted += await upsertProductFromShopify(node, auth);
    for await (const node of iterateOrders(`updated_at:>='${since.toISOString()}'`, auth)) {
      await upsertOrderFromShopify(node, auth);
      ordersUpserted++;
    }
    await db.update(syncRuns).set({ status: "ok", finishedAt: new Date(), ordersUpserted, productsUpserted, message: `Since ${since.toISOString()}` }).where(eq(syncRuns.id, run.id));
    return { ordersUpserted, productsUpserted };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(syncRuns).set({ status: "error", finishedAt: new Date(), ordersUpserted, productsUpserted, message }).where(eq(syncRuns.id, run.id));
    throw err;
  }
}

/** Sync every connected store (or one store). Stores are synced one after another; one failure does not stop the others. */
export async function syncShopify(opts: { trigger?: string; sinceDays?: number; full?: boolean; storeId?: string } = {}) {
  const auths = (await listConnectedAuths()).filter((a) => !opts.storeId || a.storeId === opts.storeId);
  if (!auths.length) throw new Error("No Shopify store is connected. Open Settings → Shopify to connect one.");
  if (running.current) return { skipped: true as const };
  running.current = true;
  try {
    let ordersUpserted = 0;
    let productsUpserted = 0;
    const errors: string[] = [];
    for (const auth of auths) {
      try {
        const r = await syncStore(auth, opts);
        ordersUpserted += r.ordersUpserted;
        productsUpserted += r.productsUpserted;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    if (errors.length === auths.length) throw new Error(errors.join(" | "));
    return { skipped: false as const, ordersUpserted, productsUpserted, stores: auths.length, errors };
  } finally {
    running.current = false;
  }
}

/** Fetch one order from Shopify and store it (used by webhooks). */
export async function syncSingleOrder(numericId: string, auth: StoreAuth) {
  const node = await fetchOrderById(numericId, auth);
  if (node) await upsertOrderFromShopify(node, auth);
  return !!node;
}

export async function syncSingleProduct(numericId: string, auth: StoreAuth) {
  const node = await fetchProductById(numericId, auth);
  if (node) await upsertProductFromShopify(node, auth);
  return !!node;
}

/** Quick connectivity check for the settings page. */
export async function testShopifyConnection(auth: StoreAuth) {
  const data: { shop: { name: string; myshopifyDomain: string; currencyCode: string } } = await shopifyGraphQL(`{ shop { name myshopifyDomain currencyCode } }`, {}, auth);
  return data.shop;
}

export async function refreshStoreWebhooks(appUrl: string, auth: StoreAuth) {
  const topics = await registerWebhooks(appUrl, auth);
  await setStoreWebhooks(auth.storeId, topics);
  return topics;
}

export async function countOrdersNeedingAttention() {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(shopifyOrders)
    .where(and(isNull(shopifyOrders.cancelledAt), isNull(shopifyOrders.closedAt), sql`${shopifyOrders.fulfillmentStatus} <> 'FULFILLED'`));
  return row?.n ?? 0;
}
