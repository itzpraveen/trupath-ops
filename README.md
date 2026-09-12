# TruPath Ops

Operations workspace for **Trupaths Ventures LLP** (Baby Gambling and Firstbon): website orders, sales and expenses for the brand and the factory as separate books, finished stock, dispatch, the factory's daily register (production, raw materials, attendance), job work, payments and reports.

Built with Next.js 16 (App Router, server actions), TypeScript, Tailwind v4 + shadcn/ui, Drizzle ORM and PostgreSQL. Designed to run on a single Render web service with a Render Postgres.

## What it automates

- **Shopify → books.** Orders from babygambling.in sync in (webhooks + a background sync every 15 min). Each order becomes a sale, each refund a return, cancellations void the sale (and any refund that was part of the cancellation), and finished stock is deducted as Shopify marks items fulfilled, so split shipments deduct in parts. For locally shipped parcels, cancellation and restock messages do not restore stock; physical receipt and inspection handle their return. Shopify-only orders retain the existing stock-sync behavior.
- **Plan → materials → production.** A production plan says what to make and by when. It prices the batch from the recipe in use and shows, material by material, whether the store can cover it before anyone starts cutting. Recording production against a plan caps the quantity at what is left, and the plan closes itself once QC has accepted the planned pieces. Voiding accepted output reopens it.
- **Recipes → raw materials.** A production entry ("made 10 nest beds") consumes its material recipe and waits for QC. Only accepted units enter finished stock. Entries can link to a website order line; rejections reopen the quantity to make. An active recipe is required unless a note explains how material use is recorded separately.
- **Dispatch → stock → Shopify.** Marking a parcel shipped deducts stock, and for website orders marks the order fulfilled in Shopify with the tracking number so the customer is notified. QC and accounts billing verification are required before packing; packing is required before shipping. Shipped parcels use a return/RTO flow: requested → in transit → received → inspected. Only inspected saleable pieces return to stock; missing and damaged pieces remain visible. Unshipped parcels may be cancelled. Website orders turn into a dispatch once every item is mapped.
- **Stock → website.** With "keep website stock in sync" on for a store, every stock change here is pushed to Shopify as the on-hand quantity; Shopify subtracts units committed to open orders itself, so the website never shows more than can actually ship.
- **Job work → materials, stock, bills.** Materials sent out leave the store, accepted pieces come into finished stock, and the job worker's bills land in the factory books as payables (one bill per batch of pieces received).
- **Raw-material purchases → expenses.** Recording a purchase can post the expense at the same time.
- **Numbering, audit trail, roles.** Every document raised here gets a financial-year number (INV/26-27/00012); website orders keep their Shopify number. Every change is logged. Four roles: owner, accounts, factory, inventory. Sign-in is throttled after repeated failures.

## Modules

| Area | Pages |
| --- | --- |
| Home | Today, this month, 30-day chart, channel split, website orders, factory today, low stock, recent entries |
| Sales & money | Sales & expenses ledger (brand / factory books) with bill photos attached to entries, Website orders, Payments (cash & bank, receivables, payables), Customers & vendors, Reports |
| Stock & dispatch | Finished stock, Products (catalogue), Dispatch with photos and printable challan |
| Factory | Daily register (production + tap-to-mark attendance), Production plan with material shortages, Production history with per-product and per-worker cost, order production progress, Raw materials, Material recipes, Attendance grid with wages, Staff, Job work with printable challan |
| Admin | Company details, Logins, Shopify connection, Lists & brands |

## Run locally

Requirements: Node 24, pnpm 10, Docker (for Postgres) or any Postgres 15+.

```bash
docker run -d --name trupath-pg -e POSTGRES_PASSWORD=trupath -e POSTGRES_USER=trupath -e POSTGRES_DB=trupath -p 127.0.0.1:56432:5432 postgres:17-alpine
cp .env.example .env            # DATABASE_URL already points at the container above
pnpm install
pnpm db:setup                   # migrations + seed (owner login, brands, materials, staff, catalogue)
pnpm dev                        # http://localhost:3000
```

First login: `owner@trupaths.in` / `change-me-now` (or whatever `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` were when the seed ran). Change it from the account menu straight away.

## Tests

- `pnpm test` runs the unit tests (Vitest): money and date helpers, role permissions, form parsing, the website-order stock planner, Shopify signature checks and secret encryption.
- `pnpm test:e2e` is the browser test. With a built server running (`PORT=3100 pnpm start`) and Google Chrome installed, it signs in, adds sales and expenses with GST, plans a batch and checks its materials, records production, marks attendance, creates a dispatch, bills a job work order in two batches, and checks role restrictions. It writes test data, so run it against a scratch database. It exits non-zero on any failure.
- `ALLOW_DB_TESTS=1 pnpm test:integration` verifies invoice issuance, counter concurrency, ledger updates, discounts, stock retries and cross-book payment guards. It requires a disposable localhost PostgreSQL database with migrations and seed applied. It also creates fixtures for `E2E_INVOICES=1 pnpm test:e2e`.
- `E2E_INVOICE_ONLY=1 E2E_INVOICES=1 pnpm test:e2e` runs the focused invoice browser journey after those fixtures exist. `E2E_INVOICE_PDF=/absolute/path/preview.pdf` optionally saves its draft as an A4 PDF.
- `E2E_DASHBOARD_ONLY=1 pnpm test:e2e` checks the brand filter, mobile layout and ledger entry defaults. `E2E_CREDIT_PDF=/absolute/path/credit-note.pdf` optionally exports the test credit note when invoice checks are enabled.
- GitHub Actions (`.github/workflows/ci.yml`) runs build, typecheck, lint, unit tests, integration tests and the browser test against a throwaway Postgres on every push and pull request.

Useful scripts: `pnpm db:generate` (new migration after editing `src/db/schema.ts`), `pnpm db:migrate`, `pnpm db:seed` (idempotent), `pnpm db:studio`, `pnpm typecheck`, `pnpm lint`.

## Production, dispatch and physical returns

See [factory management](docs/factory-management.md) for planning, shortages and production costing, and [operations workflow and validation](docs/operations-workflow.md) for the QC, billing, packing and RTO steps, migration behavior and remaining integration boundaries. Migration 0012 preserves stock from older production entries; it does not replay their stock movements.

## Tax invoices

For manual sales, use **Sales & expenses → New sale / tax invoice**. Select a saved customer, enter the agreed unit prices including GST (net of discounts), save the sale, review the draft, and issue it. For Shopify sales, refresh the order and select **Review invoice** on its order or dispatch page. **Tax invoices** lists both issued and cancelled documents.

Before issuing real invoices:

- Set each seller's legal name, registered address, GSTIN and state in Company details. Books sharing a GSTIN share invoice and credit-note counters for the same series and financial year.
- Confirm the next unused number for each series and financial year against Tally and any other invoicing system. There is no assumed live starting number. Do not issue simultaneously from another system using the same series.
- Confirm product HSN codes and GST rates. Delivery charged with goods defaults to the goods' HSN and GST rate, and its tax must reconcile with the source order. Mixed classifications require accounts review; a separate service classification must be explicitly configured after review. Buyer addresses and states are required; B2B buyers also need their GSTIN saved.
- Record the accountant's e-invoice applicability review. B2B issuance is blocked while applicability is unconfirmed or required, because the IRP connection is not implemented. A documented exemption/non-applicability review applies to every set of books sharing the GSTIN.
- Reconcile opening stock before dispatching. Saving or invoicing a manual sale does not deduct stock; shipping does.

Issued invoices retain seller, buyer, item prices and tax snapshots. Ordinary edits cannot change them, and numbers cannot move backwards. Unshipped invoices may be cancelled with a reason by accounts; their number remains in the register. For an invoiced manual dispatch that has shipped, open the invoice and choose **Record return / credit note**. Accounts enters the quantities received and quantities fit for restocking, confirms GST adjustment eligibility, reviews and issues the credit note. Configure the next unused CN number first. If the parcel already used the dispatch receipt/inspection flow, credit quantities are limited to the physical receipt and restock quantities stay zero because inspection already handled stock. Partial returns preserve the original invoice and reduce the customer's balance; only the selected saleable quantities return to stock. The credit-note register links to both documents, and customer refunds can be entered under Payments.

Shopify refunds and credit notes still require reconciliation in the existing accounting system; the local credit-note action blocks website orders to avoid duplicate refund or stock postings. Shopify orders with refunds, unsupported currency or unreconciled source totals cannot receive a newly generated invoice. The invoice register flags orders later cancelled or refunded.

GST filing, e-invoice IRNs / signed QR codes and e-way bills are not implemented. Opening stock and accounting balances must be reconciled before relying on this application as the accounting system. Migration 0007 backfills pre-existing invoices from the seller details available at migration time; it cannot reconstruct historical details that were never saved. See [invoicing readiness](docs/invoicing-readiness.md) for the current limits and setup still needed, and the [business requirements register](docs/business-requirements.md) for the owner's outstanding decisions and the QC, RTO, staff access and payroll development requirements.

## Dashboard brands and access

The dashboard separates **Brand** (All brands, Baby Gambling, Firstbon) from **Accounting books** (the configured legal/accounting ledgers). A brand can have entries in more than one set of books. Website sales inherit the store's brand; manual dispatch sales and credit notes inherit the dispatch's brand. Manual ledger entries can select a brand or remain shared/unassigned. The migration backfills known source links, without guessing a brand from a book's name.

Selecting a brand filters sales, expenses, returns, channels, website orders, dispatch, finished stock, production and recent entries. Ledger, order, dispatch and stock links retain the brand. Shared/unassigned costs remain in All brands, so a selected brand's net is not a fully allocated profit. Staff attendance and raw materials remain shared factory information.

Owner and Accounts dashboards show financial summaries. Factory shows production, attendance and stock; Inventory & dispatch shows stock and dispatch without dashboard revenue totals. Brand selection is a reporting filter, not a per-user brand access restriction. Job roles on staff records are separate from login roles; login access is configured under Settings → Logins.

## Deploy on Render

The 10 September product update adds **Products → Supplied catalogue**. Choose a brand, review the supplied workbook matches, and apply HSN/GST details to existing products. Purchase/sale amounts remain references unless explicitly selected as costs or GST-inclusive manual prices; Shopify prices and stock are preserved. Complete feeding pillows wait for the cover/inner selling amounts, and Shopify tax discrepancies require review before invoicing. See [the product requirements and remaining decisions](docs/business-requirements.md#product-and-gst-information-supplied--10-september-2026). Apply migration 0013 with the release; this source update does not import data into production automatically.

1. Push this repository to GitHub (private is fine).
2. In Render: **New → Blueprint**, pick the repo. `render.yaml` creates a Starter web service and a Basic-256MB Postgres, both in Singapore. Approximate cost: about $13/month. (Free instances sleep after 15 minutes and free databases are deleted after 30 days, so they are not suitable for a business tool.)
3. When prompted, fill in the environment variables marked `sync: false`:
   - `APP_URL` — the service URL, e.g. `https://trupath-ops.onrender.com`
   - `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD` — the first owner login (only used if no users exist yet; blank values fall back to the defaults)
   - `SHOPIFY_*` — can be left empty until you connect the store (see below)
   `APP_ENCRYPTION_KEY` and `CRON_SECRET` are generated by the blueprint. Keep `APP_ENCRYPTION_KEY` stable: it encrypts the Shopify tokens stored in the database. If you added it to a deployment that already had stores connected, nothing needs to be done; older tokens encrypted with the Shopify client secret stay readable.
4. Migrations and the idempotent seed run before the server starts (`npm run start:render`), and also as a pre-deploy step on paid plans, so schema changes are applied automatically.
5. Open the URL, sign in, change the owner password, add logins for the accounts, factory and dispatch people.

Custom domain: add e.g. `ops.babygambling.in` under the service's Settings → Custom domains and follow the DNS instructions.

## Connect Shopify

More than one store is supported (Baby Gambling and Firstbon each have a card under Settings → Shopify, with their own brand, books and app credentials). Settings → Shopify inside the app lists the exact steps. Two ways work:

- **Dev Dashboard app (recommended).** Create an app at dev.shopify.com, set the App URL to your app address, untick "Embed app in Shopify admin", add the scopes `read_orders, read_all_orders, read_products, read_inventory, write_inventory, read_locations, read_customers, read_merchant_managed_fulfillment_orders, write_merchant_managed_fulfillment_orders`, tick "Use legacy install flow", add `https://<app>/api/shopify/callback` as the allowed redirection URL, release the version, request protected customer data access (name, address, email, phone) and set custom distribution to your store. Copy the client id and secret into `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET`, set `SHOPIFY_STORE_DOMAIN`, then press **Connect to Shopify** in the app. The token is stored encrypted and the webhooks are registered for you.
- **Legacy custom app token.** If your store still offers Settings → Apps → Develop apps, set `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_ADMIN_TOKEN` instead, and add webhooks by hand with `SHOPIFY_WEBHOOK_SECRET`. The stock baseline for such a store is set the first time it syncs, so historical orders never change stock.

The in-process scheduler (`SHOPIFY_SYNC_MINUTES`) is enough on Render. If you host somewhere that sleeps or scales to zero, set it to `0` and call `GET /api/cron/shopify-sync?key=<CRON_SECRET>` from an external cron every 15 minutes instead.

## Environment variables

`.env.example` lists them all with comments; copy it to `.env` for local work.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (required) |
| `APP_URL` | Public address of the app, used for Shopify redirects and webhooks (required) |
| `PRODUCT_CATALOGUE_PRICES_JSON` | Private workbook price references keyed by catalogue row, with nullable `purchasePriceP` and `salePriceP` in paise. Set only in private server configuration; missing references stay blank. Real amounts must never be committed to this public repository. |
| `APP_ENCRYPTION_KEY` | Encrypts Shopify tokens and client secrets stored in the database. Falls back to `SHOPIFY_CLIENT_SECRET`; set a dedicated key so rotating that secret does not lock the stored tokens |
| `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD`, `SEED_OWNER_NAME` | First owner login, used only while no users exist |
| `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` | Optional server-level app credentials for one store; per-store credentials entered in Settings take precedence |
| `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_WEBHOOK_SECRET` | Legacy custom-app token path only |
| `SHOPIFY_API_VERSION` | Admin API version, default `2026-07` |
| `SHOPIFY_SYNC_MINUTES` | Background sync interval; `0` disables it |
| `CRON_SECRET` | Key for `GET /api/cron/shopify-sync` when an external cron is used |
| `DATABASE_SSL` | `require` forces TLS for external database URLs |
| `DATABASE_POOL_MAX` | Connection pool size, default 8 |
| `COOKIE_SECURE` | `false` allows testing a production build over plain http |
| `STOCK_BASELINE` | Override date for `pnpm stock:undo-import` |
| `TZ` | Set to `Asia/Kolkata` so dates in logs match the business day |

## Data model notes

- Money is stored as integer paise; quantities of raw material keep three decimals.
- `entities` are accounting books; the configured list can include `brand`, `factory` and `firstbon`. Ledger entries, payments, bank accounts, dispatches and job work carry an `entity_id`. `brands` is a separate dimension. Ledger `brand_id` is nullable for shared/unassigned entries, and must not be inferred from `entity_id`.
- Stock and material balances only change through `adjustStock` / `adjustMaterial`, which lock the row and write a movement, so history always explains the balance.
- Website orders placed before the store was connected (the "stock baseline") never change finished stock; `npm run stock:undo-import` repairs stock if such orders were deducted before this rule existed.
- Each website order line remembers how many units left stock (`deductedQty` in `shopify_orders.line_items`), so partial fulfilments, dispatches created from orders in this app, cancellations and dispatch returns never deduct or restore twice. The planner is pure (`src/lib/order-stock.ts`) and unit-tested.
- Job work bills cover the accepted pieces received since the previous bill (`billed_qty` on the order), so a job worker delivering in batches is billed per batch.
- Synced records carry a `source_ref` (e.g. `shopify:order:123:sale`) that makes repeated syncs idempotent.
- Photos and PDFs (dispatch photos, job work files, bills on ledger entries) are stored in Postgres (`uploads`), resized in the browser first, and served only to roles that may view the module they belong to. Move to S3/R2 if volumes grow.
- Production plans estimate material and labour cost from the recipe in use at the time of planning; the production entry records what actually left the store. A plan never moves stock by itself.
- Raw-material movements carry the date entered in the dialog (`work_date`), so backdated usage and counts show under the right day; `created_at` still records when it was typed in.

## Backups

Render Postgres keeps daily backups on paid plans. For an extra copy, `pg_dump "$DATABASE_URL" > backup.sql` from a machine with access to the external connection string.
