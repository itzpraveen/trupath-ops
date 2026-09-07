# TruPath Ops

Operations workspace for **Trupaths Ventures LLP** (Baby Gambling and Firstbon): website orders, sales and expenses for the brand and the factory as separate books, finished stock, dispatch, the factory's daily register (production, raw materials, attendance), job work, payments and reports.

Built with Next.js 16 (App Router, server actions), TypeScript, Tailwind v4 + shadcn/ui, Drizzle ORM and PostgreSQL. Designed to run on a single Render web service with a Render Postgres.

## What it automates

- **Shopify → books.** Orders from babygambling.in sync in (webhooks + a background sync every 15 min). Each order becomes a sale, each refund a return, cancellations void the sale, and finished stock is deducted when Shopify marks the order fulfilled.
- **Recipes → raw materials.** A production entry ("made 10 nest beds") adds finished stock and deducts fabric, foam, zips etc. per the product's recipe (bill of materials).
- **Dispatch → stock → Shopify.** Marking a parcel shipped deducts stock, and for website orders marks the order fulfilled in Shopify with the tracking number so the customer is notified. Returns and cancellations put stock back. Website orders turn into a dispatch with one click.
- **Stock → website.** With "keep website stock in sync" on for a store, every stock change here is pushed to Shopify as the available quantity.
- **Job work → materials, stock, bills.** Materials sent out leave the store, accepted pieces come into finished stock, and the job worker's bill lands in the factory books as a payable.
- **Raw-material purchases → expenses.** Recording a purchase can post the expense at the same time.
- **Numbering, audit trail, roles.** Every document gets a financial-year number (INV/26-27/00012). Every change is logged. Four roles: owner, accounts, factory, inventory.

## Modules

| Area | Pages |
| --- | --- |
| Home | Today, this month, 30-day chart, channel split, website orders, factory today, low stock, recent entries |
| Sales & money | Sales & expenses ledger (brand / factory books), Website orders, Payments (cash & bank, receivables, payables), Customers & vendors, Reports |
| Stock & dispatch | Finished stock, Products (catalogue), Dispatch with photos and printable challan |
| Factory | Daily register (production + tap-to-mark attendance), Production history, Raw materials, Material recipes, Attendance grid with wages, Staff, Job work with printable challan |
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

Browser test: with a built server running (`PORT=3100 pnpm start`) and Google Chrome installed, `pnpm test:e2e` signs in, adds sales and expenses, records production, marks attendance, creates a dispatch and a job work order, and checks role restrictions. It writes test data, so run it against a scratch database.

Useful scripts: `pnpm db:generate` (new migration after editing `src/db/schema.ts`), `pnpm db:migrate`, `pnpm db:seed` (idempotent), `pnpm db:studio`, `pnpm typecheck`, `pnpm lint`.

## Deploy on Render

1. Push this repository to GitHub (private is fine).
2. In Render: **New → Blueprint**, pick the repo. `render.yaml` creates a Starter web service and a Basic-256MB Postgres, both in Singapore. Approximate cost: about $13/month. (Free instances sleep after 15 minutes and free databases are deleted after 30 days, so they are not suitable for a business tool.)
3. When prompted, fill in the environment variables marked `sync: false`:
   - `APP_URL` — the service URL, e.g. `https://trupath-ops.onrender.com`
   - `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD` — the first owner login (only used if no users exist yet)
   - `SHOPIFY_*` — can be left empty until you connect the store (see below)
4. Migrations and the idempotent seed run before the server starts (`npm run start:render`), and also as a pre-deploy step on paid plans, so schema changes are applied automatically.
5. Open the URL, sign in, change the owner password, add logins for the accounts, factory and dispatch people.

Custom domain: add e.g. `ops.babygambling.in` under the service's Settings → Custom domains and follow the DNS instructions.

## Connect Shopify

More than one store is supported (Baby Gambling and Firstbon each have a card under Settings → Shopify, with their own brand, books and app credentials). Settings → Shopify inside the app lists the exact steps. Two ways work:

- **Dev Dashboard app (recommended).** Create an app at dev.shopify.com, set the App URL to your app address, untick "Embed app in Shopify admin", add the scopes `read_orders, read_all_orders, read_products, read_inventory, write_inventory, read_locations, read_customers, read_merchant_managed_fulfillment_orders, write_merchant_managed_fulfillment_orders`, tick "Use legacy install flow", add `https://<app>/api/shopify/callback` as the allowed redirection URL, release the version, request protected customer data access (name, address, email, phone) and set custom distribution to your store. Copy the client id and secret into `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET`, set `SHOPIFY_STORE_DOMAIN`, then press **Connect to Shopify** in the app. The token is stored encrypted and the webhooks are registered for you.
- **Legacy custom app token.** If your store still offers Settings → Apps → Develop apps, set `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_ADMIN_TOKEN` instead, and add webhooks by hand with `SHOPIFY_WEBHOOK_SECRET`.

The in-process scheduler (`SHOPIFY_SYNC_MINUTES`) is enough on Render. If you host somewhere that sleeps or scales to zero, set it to `0` and call `GET /api/cron/shopify-sync?key=<CRON_SECRET>` from an external cron every 15 minutes instead.

## Environment variables

See `.env.example`. `DATABASE_URL` and `APP_URL` are required. `DATABASE_SSL=require` forces TLS for external database URLs.

## Data model notes

- Money is stored as integer paise; quantities of raw material keep three decimals.
- `entities` are the two sets of books (`brand`, `factory`). Ledger entries, payments, bank accounts, dispatches and job work carry an `entity_id`.
- Stock and material balances only change through `adjustStock` / `adjustMaterial`, which lock the row and write a movement, so history always explains the balance.
- Website orders placed before the store was connected (the "stock baseline") never change finished stock; `npm run stock:undo-import` repairs stock if such orders were deducted before this rule existed.
- Synced records carry a `source_ref` (e.g. `shopify:order:123:sale`) that makes repeated syncs idempotent.
- Photos are stored in Postgres (`uploads`), resized in the browser first. Move to S3/R2 if volumes grow.

## Backups

Render Postgres keeps daily backups on paid plans. For an extra copy, `pg_dump "$DATABASE_URL" > backup.sql` from a machine with access to the external connection string.
