# Factory management — 12 September 2026

This describes the planning, shortage and costing layer added on top of the production and QC workflow in [operations workflow](operations-workflow.md). It changes no tax, payroll or access decision, and it does not move stock by itself.

## What the factory does day to day

1. **Plan the batch.** Factory → Production plan → **Plan production**. Choose the product, how many pieces and the date it should be finished by. While the form is open it prices the batch from the recipe in use and lists every material with what is needed, what the store holds and what is short. It also says how many pieces the store currently covers. Nothing is deducted at this point: a plan is an intention, not a movement.
2. **Watch the shortages.** The plan page adds every open plan together into one material list, with the shortfall and roughly what it costs to buy at the saved purchase rates. Raw materials shows the same requirement per material, next to the minimum-stock warning that already existed.
3. **Record what was made.** On the daily register, **Record production** now offers the open plans alongside website order lines. Choosing a plan fixes the product and caps the quantity at what is left on that plan. Materials leave the store at this point, as before, and the batch waits for QC.
4. **Inspect.** QC acceptance is unchanged. A plan closes itself once QC has accepted the planned quantity. Rejected pieces come back into the remaining quantity, so the plan stays open until good pieces cover it. Voiding a batch that had completed a plan reopens that plan.
5. **Close or cancel.** A plan with nothing recorded against it can be cancelled with a reason. One that has production can be closed with a reason; the production already recorded is untouched.

## Recipes

The recipe list shows which version is **in use**, how many pieces the current material stock covers, and the material and labour cost per piece. **Use this** / **Stop using** switch the recipe production consumes, without deleting the old one. **Copy** opens a new recipe pre-filled from the current one at the next version number; saving it makes it the one in use, and past batches keep pointing at the version they actually consumed. Deleting a recipe now also releases the plans that estimated from it.

## Costing

Production shows material and labour for the month, the total, and the cost of one accepted piece. **What each product cost** breaks that down per product; **Who made what** shows units, QC result, days worked and reject rate for the person recorded on each batch. Labour defaults to the recipe's labour rate for the quantity made, and can be overridden per batch in the dialog. Rejected pieces keep their material cost, so cost per accepted piece rises when QC rejects work — that is deliberate.

## What this does not do

- **No work-in-progress valuation.** Materials leave the store when production is recorded and finished stock arrives when QC accepts. Pieces between those two points are visible as "awaiting QC" but are not valued as a WIP balance.
- **No stores or locations.** There is one raw-material store and one finished-stock balance.
- **No scheduling or capacity.** A plan has a finish-by date, not a machine, shift or worker allocation.
- **No payroll change.** Attendance still derives daily wages; the monthly pay basis in the [business requirements register](business-requirements.md) is still pending the owner's decision, and production labour cost is a separate figure from wages.
- **No purchase raising.** Shortages are shown with an indicative cost. Buying them is still a raw-material purchase entry.

## Data and migration

Migration `0014_production_plans.sql` adds `production_plans` and a nullable `plan_id` on `production_entries`. It is additive: existing production, stock, material balances and recipes are untouched, and entries recorded before it simply have no plan. Plans carry their own financial-year number series (`PLN/26-27/00001`). The estimate stored on a plan is a snapshot from the recipe at planning time; the production entry remains the record of what actually left the store.

## Validation

Performed on 12 September 2026 against a disposable local PostgreSQL database:

- `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (79 unit tests, including the requirement, shortage and coverage maths).
- `ALLOW_DB_TESTS=1 pnpm test:integration` — 51 PostgreSQL tests. Two are new: a plan that caps production at the remaining quantity, closes itself on QC acceptance and reopens when that output is voided; and a plan that reports a shortage before the materials leave the store and can be cancelled while nothing has been made.
- `E2E_INVOICES=1 pnpm test:e2e` — 38 browser checks, no console errors, including planning a batch, seeing its material check, recording part of it against the plan and finding the remaining piece on the daily register.

No production data was touched. The scratch database was dropped afterwards.
