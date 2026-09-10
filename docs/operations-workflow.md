# Operations continuation — 9 September 2026

This change completes the interrupted production/QC and physical-return work in the local checkout. Deployment and live user acceptance remain outstanding. No production data, tax classifications, invoice starting numbers, payroll rates or staff access assignments were changed.

## Daily workflow

1. **Record production.** Factory can choose a mapped website order line or make general finished stock. The daily register shows remaining order quantities, quantities awaiting QC and accepted quantities. Remaining quantities are before allocating existing stock; the list is not an instruction to manufacture every open order. Production consumes the active material recipe. Without recipe consumption, a material-recording explanation is required.
2. **Inspect QC.** Enter accepted and rejected quantities plus an inspection note. Partial inspections are supported. Accepted goods enter finished stock once; rejected goods stay out and their materials remain consumed. Rejections reopen the order quantity for replacement production. The QC queue includes pending batches across all dates. Voiding an entry reverses its accepted stock and material movements only when sufficient stock remains; order-linked batches cannot be voided after that order ships.
3. **Verify and pack.** Dispatch checks actual QC-accepted goods, including existing stock. Where production was linked to an order, accepted output must cover the parcel quantity. Accounts verifies billing and records the invoice/check reference, including an external invoice when appropriate. Both checks are required before packing; only packed parcels can ship. Sale/item edits clear the checks, as do relevant website order changes. Shipping checks stock again. These checks do not issue an invoice or certify tax configuration.
4. **Ship.** Shipping deducts stock atomically and can write the parcel quantities and tracking to Shopify. Direct website fulfillment from the app requires a checked, shipped dispatch. A shipped parcel cannot use the unshipped cancellation path.
5. **Track return/RTO.** Record the refusal/return reason, then return in transit, physical receipt and inspection. A parcel may move directly from requested to received when it has already arrived. Enter every product's physical count, including zero for missing products. Receipt holds goods outside saleable stock. Inspection classifies all received pieces as saleable or damaged and restores only the saleable pieces. Event history records stages, quantities, notes and the acting login. Repeated/stale submissions cannot repeat the stock effect.
6. **Accounts review.** Physical return handling does not void a sale, create a credit note, refund a customer, restrict COD or charge resend fees. A manual invoice can receive a credit note after inspection, limited to received quantities with zero additional restocking. The existing standalone credit-note return flow remains supported; a parcel already processed through it cannot start a second physical-return flow. Shopify refunds and credit notes still need reconciliation through the existing accounting process.

Existing module permissions apply: Factory/Owner record and inspect production; Inventory & dispatch, Accounts and Owner operate dispatch/physical returns; Accounts/Owner verify billing. This change does not implement or grant the proposed employee-specific or brand-specific access matrix.

## Migration and stock behavior

Migration `0012_production_qc_and_returns.sql` adds QC counters/events, order-line production references, dispatch check metadata and return/event tables. Production entries already recorded before this migration are marked as legacy output with their original quantity accepted. No stock movements are replayed, and no historical QC inspector or inspection is invented. New entries default to awaiting QC.

For parcels shipped from this app, Shopify cancellation/restock messages leave physical stock out until return inspection. The per-line quantities already deducted remain recorded so later sync cannot deduct the same shipment again. Existing locally shipped parcels receive this behavior during migration when their stock has not already been restored. If Shopify had already restored a legacy parcel, physical-return entry blocks and asks for reconciliation. Shopify-only shipments without a local dispatch retain the existing stock-sync behavior.

Before any production release: take the normal database backup, review active/legacy parcels, apply the migration, verify production/QC counts and sample stock balances, and perform the operator/accounting acceptance journey. Do not apply the test database's fixtures to production.

## Validation

- `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`.
- Disposable PostgreSQL: migrations and seed, then `ALLOW_DB_TESTS=1 pnpm test:integration` with its localhost `DATABASE_URL`.
- Integration checks cover recipe consumption, QC partial acceptance/rejection, concurrent submissions, order pending quantities, gate permissions, invalidation on edits, RTO receipt/inspection, missing/damaged goods, repeated Shopify sync and credit-note double-restock prevention.
- `E2E_INVOICES=1 pnpm test:e2e` against a production build of the scratch database includes QC, billing, packing, shipment and mobile return inspection alongside the existing invoice and role journeys.

Validation completed on 9 September: production build, lint, typecheck, 61 unit tests, 36 PostgreSQL integration tests and 37 browser checks passed. The browser run reported no console errors. A separate upgrade check migrated legacy production from schema 0011, confirmed its stock balance and movement count stayed unchanged, confirmed new production waits for QC, and reran migrations without replaying stock. Test data was confined to a disposable local PostgreSQL instance.

## Remaining scope

Direct Delhivery events/labels, COD settlements, automatic resend/COD policies, statutory connections, Shopify credit notes, monthly payroll and per-user brand enforcement are still pending. Production linking currently covers mapped website order lines; manual orders can use general production and verified existing stock. This version handles one returned parcel and one final receipt/inspection per dispatch. Missing pieces remain an explicit discrepancy; later separate parcels or amendments need a further reviewed workflow. Rework/scrap costing and job-work rates still need approved business rules. No unapproved commercial or tax policy is inferred here.
