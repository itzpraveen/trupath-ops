CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"entity_id" text NOT NULL,
	"issued_on" date NOT NULL,
	"customer_name" text NOT NULL,
	"customer_address" text DEFAULT '' NOT NULL,
	"customer_phone" text,
	"customer_email" text,
	"customer_gstin" text,
	"customer_state_code" text NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"taxable_p" bigint DEFAULT 0 NOT NULL,
	"cgst_p" bigint DEFAULT 0 NOT NULL,
	"sgst_p" bigint DEFAULT 0 NOT NULL,
	"igst_p" bigint DEFAULT 0 NOT NULL,
	"round_off_p" bigint DEFAULT 0 NOT NULL,
	"total_p" bigint DEFAULT 0 NOT NULL,
	"order_ref" text,
	"dispatch_number" text,
	"courier" text,
	"tracking_no" text,
	"destination" text,
	"payment_terms" text,
	"shopify_order_id" text,
	"dispatch_id" uuid,
	"record_id" uuid,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	CONSTRAINT "invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "invoice_prefix" text DEFAULT 'B2C' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "hsn_code" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "gst_rate" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "shopify_orders" ADD COLUMN "billing_address" jsonb;--> statement-breakpoint
ALTER TABLE "shopify_orders" ADD COLUMN "taxes_included" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_order_idx" ON "invoices" USING btree ("shopify_order_id");--> statement-breakpoint
CREATE INDEX "invoices_dispatch_idx" ON "invoices" USING btree ("dispatch_id");--> statement-breakpoint
CREATE INDEX "invoices_entity_date_idx" ON "invoices" USING btree ("entity_id","issued_on");