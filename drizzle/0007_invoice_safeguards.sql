ALTER TABLE "invoices" DROP CONSTRAINT "invoices_number_unique";--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD COLUMN "unit_price_p" bigint;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "seller_gstin" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "seller" jsonb;--> statement-breakpoint
-- Backfill the former live-company print data once; future prints use only this snapshot.
UPDATE invoices i SET seller_gstin = upper(coalesce(e.gstin, '')), seller = jsonb_build_object(
  'legalName', coalesce(e.legal_name, e.name), 'gstin', upper(coalesce(e.gstin, '')),
  'address', coalesce(e.address, ''), 'stateCode', coalesce(e.state_code, ''), 'phone', e.phone, 'email', e.email
) FROM entities e WHERE e.id = i.entity_id;--> statement-breakpoint
ALTER TABLE invoices ALTER COLUMN seller_gstin SET NOT NULL;--> statement-breakpoint
ALTER TABLE invoices ALTER COLUMN seller SET NOT NULL;--> statement-breakpoint
-- Preserve configured legacy counters when books share a registration.
INSERT INTO number_counters (series_key, period_key, next)
SELECT 'invoice:' || upper(e.gstin) || ':' || split_part(n.series_key, ':', 3), n.period_key, max(n.next)
FROM number_counters n JOIN entities e ON split_part(n.series_key, ':', 2) = e.id
WHERE n.series_key LIKE 'invoice:%' AND e.gstin IS NOT NULL
GROUP BY upper(e.gstin), split_part(n.series_key, ':', 3), n.period_key
ON CONFLICT (series_key, period_key) DO UPDATE SET next = greatest(number_counters.next, excluded.next);--> statement-breakpoint
-- Also protect numbers issued before a counter was explicitly configured.
INSERT INTO number_counters (series_key, period_key, next)
SELECT 'invoice:' || seller_gstin || ':' || split_part(number, '/', 1), split_part(number, '/', 3), max(split_part(number, '/', 2)::integer) + 1
FROM invoices WHERE number ~ '^[A-Z0-9-]+/[0-9]+/[0-9]{2}-[0-9]{2}$'
GROUP BY seller_gstin, split_part(number, '/', 1), split_part(number, '/', 3)
ON CONFLICT (series_key, period_key) DO UPDATE SET next = greatest(number_counters.next, excluded.next);--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_gstin_number_unique" ON "invoices" USING btree ("seller_gstin","number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_live_order_unique" ON "invoices" USING btree ("shopify_order_id") WHERE "invoices"."voided_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_live_dispatch_unique" ON "invoices" USING btree ("dispatch_id") WHERE "invoices"."voided_at" is null;