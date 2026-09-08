ALTER TABLE "invoices" ADD COLUMN "supply_state_code" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "delivery_address" text;
--> statement-breakpoint
UPDATE invoices SET supply_state_code = customer_state_code;
--> statement-breakpoint
ALTER TABLE invoices ALTER COLUMN supply_state_code SET NOT NULL;
