import "dotenv/config";
import { count, eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { hashPassword } from "../lib/password";
import catalog from "./seed-data/catalog.json";
import catalogFirstbon from "./seed-data/catalog-firstbon.json";
import { inArray, isNull } from "drizzle-orm";

type CatalogItem = {
  productId: string;
  variantId: string;
  title: string;
  variant: string;
  sku: string | null;
  category: string | null;
  priceP: number;
  image: string | null;
};

const MATERIALS: Array<[string, string, number, number]> = [
  ["Premium Muslin WHITE", "metres", 259, 200],
  ["Premium Muslin BLUE", "metres", 136, 150],
  ["Premium Muslin PINK", "metres", 140, 150],
  ["Premium Muslin YELLOW", "metres", 100, 100],
  ["MOSQUITO NET", "metres", 270, 300],
  ["ZIP BIG", "metres", 350, 200],
  ["ZIP SMALL", "metres", 600, 300],
  ["SB PRINT", "metres", 55, 150],
  ["DN PRINT", "metres", 97, 150],
  ["DD PRINT", "metres", 175, 150],
  ["CHOCO SKY PRINT", "metres", 137, 80],
  ["CS PRINT", "metres", 75, 80],
  ["AV PRINT", "metres", 177, 80],
  ["CUTE SKY PRINT", "metres", 114, 80],
  ["CUTE BEAR PRINT", "metres", 128.75, 50],
  ["STRAWBERRY PRINT", "metres", 92, 50],
  ["LINING", "metres", 420, 350],
  ["MULL", "metres", 3294, 350],
  ["RECCON SPONGE", "kg", 225, 350],
  ["RECCON SHEET", "metres", 15, 10],
  ["PIPE", "metres", 587.5, 300],
  ["FOAM 5 MM", "sheets", 20, 5],
  ["BED FOAM", "sheets", 12, 5],
  ["LACE", "metres", 662.5, 400],
];

const CATEGORIES: Array<[schema.CategoryKind, string[]]> = [
  [
    "expense",
    [
      "Raw material purchase",
      "Job work",
      "Salary & wages",
      "Packaging",
      "Courier & shipping",
      "Advertising & marketing",
      "Rent",
      "Electricity & utilities",
      "Office & admin",
      "Repairs & maintenance",
      "Travel & fuel",
      "Bank & gateway charges",
      "Tea & snacks",
      "Other",
    ],
  ],
  ["channel", ["Own website", "Offline / direct", "Wholesale / B2B", "Marketplace", "Instagram / WhatsApp"]],
  ["process", ["Stitching", "Cutting", "Embroidery", "Printing", "Quilting", "Packing"]],
  ["designation", ["Manager", "Stitching", "Cutting", "Helper", "Packing", "Quality check"]],
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { max: 1, ssl: process.env.DATABASE_SSL === "require" ? "require" : undefined });
  const db = drizzle(sql, { schema, casing: "snake_case" });

  await db
    .insert(schema.entities)
    .values([
      { id: "brand", name: "Trupaths Ventures", legalName: "Trupaths Ventures LLP", stateCode: "32", sortOrder: 0 },
      { id: "factory", name: "Trupaths Factory", legalName: "Trupaths Ventures LLP (Factory)", stateCode: "32", sortOrder: 1 },
      { id: "firstbon", name: "Firstbon", legalName: "Firstbon", stateCode: "32", sortOrder: 2 },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.brands)
    .values([
      { id: "babygambling", name: "Baby Gambling", sortOrder: 0 },
      { id: "firstbon", name: "Firstbon", sortOrder: 1 },
    ])
    .onConflictDoNothing();

  for (const [kind, names] of CATEGORIES) {
    await db
      .insert(schema.categories)
      .values(names.map((name, i) => ({ kind, name, sortOrder: i })))
      .onConflictDoNothing();
  }

  await db
    .insert(schema.materials)
    .values(MATERIALS.map(([name, unit, qty, minQty], i) => ({ code: `RM-${String(i + 1).padStart(3, "0")}`, name, unit, qty, minQty })))
    .onConflictDoNothing();

  await db
    .insert(schema.employees)
    .values([
      { code: "1", name: "Hanan", designation: "Manager", joinedAt: "2026-09-04" },
      { code: "2", name: "Anitha", designation: "Stitching", joinedAt: "2026-09-04" },
    ])
    .onConflictDoNothing();

  const banks: Array<{ entityId: string; name: string; type: "cash" | "bank" }> = [
    { entityId: "brand", name: "Cash in hand", type: "cash" },
    { entityId: "brand", name: "Bank account", type: "bank" },
    { entityId: "factory", name: "Factory cash", type: "cash" },
  ];
  for (const b of banks) {
    const existing = await db
      .select({ id: schema.bankAccounts.id })
      .from(schema.bankAccounts)
      .where(and(eq(schema.bankAccounts.entityId, b.entityId), eq(schema.bankAccounts.name, b.name)))
      .limit(1);
    if (!existing.length) await db.insert(schema.bankAccounts).values(b);
  }

  // Store rows: Baby Gambling and Firstbon. Credentials/tokens are added from Settings → Shopify.
  await db
    .insert(schema.shopifyStores)
    .values([
      { shop: "jedtmv-0e.myshopify.com", label: "Baby Gambling website", brandId: "babygambling", entityId: "brand" },
      { shop: "tswyfk-qm.myshopify.com", label: "Firstbon website", brandId: "firstbon", entityId: "firstbon" },
    ])
    .onConflictDoNothing();

  // Move a connection made by the single-store version into the store row (ciphertext is compatible).
  const [legacy] = await db.select().from(schema.settings).where(eq(schema.settings.key, "shopify.connection")).limit(1);
  if (legacy) {
    const v = legacy.value as { shop: string; tokenEnc: string; scope: string; installedAt: string; webhooks?: string[] };
    const [baselineRow] = await db.select().from(schema.settings).where(eq(schema.settings.key, "shopify.stockBaselineAt")).limit(1);
    const baseline = baselineRow && typeof baselineRow.value === "string" ? new Date(baselineRow.value) : new Date(v.installedAt);
    await db
      .update(schema.shopifyStores)
      .set({ tokenEnc: v.tokenEnc, scope: v.scope, installedAt: new Date(v.installedAt), baselineAt: baseline, webhooks: v.webhooks ?? [], clientId: process.env.SHOPIFY_CLIENT_ID?.trim() || null })
      .where(and(eq(schema.shopifyStores.shop, v.shop), isNull(schema.shopifyStores.tokenEnc)));
    await db.delete(schema.settings).where(inArray(schema.settings.key, ["shopify.connection", "shopify.stockBaselineAt", "shopify.lastSyncAt"]));
    console.log(`Moved the existing ${v.shop} connection into the stores table.`);
  }
  // Orders synced before stores existed belong to the Baby Gambling store.
  await db
    .update(schema.shopifyOrders)
    .set({ shop: "jedtmv-0e.myshopify.com", brandId: "babygambling", entityId: "brand" })
    .where(isNull(schema.shopifyOrders.shop));

  // Catalogues from the public Shopify listings. Later syncs match on shopify_variant_id.
  const items = [...(catalog as CatalogItem[]).map((c) => ({ ...c, brandId: "babygambling" })), ...(catalogFirstbon as CatalogItem[]).map((c) => ({ ...c, brandId: "firstbon" }))];
  const chunk = 100;
  let inserted = 0;
  for (let i = 0; i < items.length; i += chunk) {
    const rows = items.slice(i, i + chunk).map((c) => ({
      brandId: c.brandId,
      name: c.title,
      variant: c.variant,
      sku: c.sku,
      category: c.category,
      shopifyProductId: c.productId,
      shopifyVariantId: c.variantId,
      imageUrl: c.image,
      priceP: c.priceP,
      source: "shopify" as const,
    }));
    const res = await db.insert(schema.products).values(rows).onConflictDoNothing().returning({ id: schema.products.id });
    inserted += res.length;
  }

  const [{ n: userCount }] = await db.select({ n: count() }).from(schema.users);
  if (Number(userCount) === 0) {
    const email = (process.env.SEED_OWNER_EMAIL ?? "owner@trupaths.in").toLowerCase();
    const password = process.env.SEED_OWNER_PASSWORD ?? "change-me-now";
    await db.insert(schema.users).values({
      name: process.env.SEED_OWNER_NAME ?? "Owner",
      email,
      passwordHash: hashPassword(password),
      role: "owner",
    });
    console.log(`Created owner login: ${email} / ${password}  <- change this after first sign-in`);
  }

  console.log(`Seed complete. Catalogue rows added: ${inserted}`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
