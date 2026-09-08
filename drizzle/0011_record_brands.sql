ALTER TABLE "business_records" ADD COLUMN "brand_id" text;--> statement-breakpoint
ALTER TABLE "business_records" ADD CONSTRAINT "business_records_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "records_brand_date_idx" ON "business_records" USING btree ("brand_id","work_date");--> statement-breakpoint
-- Only infer brands from linked operational records, never from the name of a set of books.
UPDATE business_records r SET brand_id = o.brand_id FROM shopify_orders o JOIN brands b ON b.id = o.brand_id WHERE r.shopify_order_id = o.id AND r.brand_id IS NULL;
--> statement-breakpoint
UPDATE business_records r SET brand_id = d.brand_id FROM dispatches d WHERE r.source_ref = 'dispatch:' || d.id::text AND r.brand_id IS NULL;
--> statement-breakpoint
UPDATE business_records r SET brand_id = d.brand_id FROM credit_notes c JOIN invoices i ON i.id = c.invoice_id JOIN dispatches d ON d.id = i.dispatch_id WHERE r.id = c.record_id AND r.brand_id IS NULL;
