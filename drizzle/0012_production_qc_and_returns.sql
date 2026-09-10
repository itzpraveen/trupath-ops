CREATE TABLE "production_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_id" uuid NOT NULL,
	"accepted_qty" integer NOT NULL,
	"rejected_qty" integer NOT NULL,
	"note" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_return_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"event" text NOT NULL,
	"note" text NOT NULL,
	"lines" jsonb NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"stage" text DEFAULT 'requested' NOT NULL,
	"lines" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_returns_dispatchId_unique" UNIQUE("dispatch_id")
);
--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "quality_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "quality_checked_by" uuid;--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "billing_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "billing_checked_by" uuid;--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "billing_reference" text;--> statement-breakpoint
ALTER TABLE "production_entries" ADD COLUMN "shopify_order_id" text;--> statement-breakpoint
ALTER TABLE "production_entries" ADD COLUMN "shopify_line_id" text;--> statement-breakpoint
ALTER TABLE "production_entries" ADD COLUMN "qc_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "production_entries" ADD COLUMN "accepted_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "production_entries" ADD COLUMN "rejected_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "production_entries" ADD COLUMN "qc_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shopify_orders" ADD COLUMN "local_returns" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "production_checks" ADD CONSTRAINT "production_checks_production_id_production_entries_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."production_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_checks" ADD CONSTRAINT "production_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_return_events" ADD CONSTRAINT "shipment_return_events_return_id_shipment_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."shipment_returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_return_events" ADD CONSTRAINT "shipment_return_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_returns" ADD CONSTRAINT "shipment_returns_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_returns" ADD CONSTRAINT "shipment_returns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_quality_checked_by_users_id_fk" FOREIGN KEY ("quality_checked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_billing_checked_by_users_id_fk" FOREIGN KEY ("billing_checked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Existing entries already posted their finished-stock movements. Preserve their balances.
UPDATE "production_entries" SET "qc_required" = false, "accepted_qty" = "qty";
--> statement-breakpoint
-- Parcels already shipped locally must also wait for physical return inspection.
UPDATE "shopify_orders" o SET "local_returns" = true
WHERE NOT o."stock_restored" AND EXISTS (
  SELECT 1 FROM "dispatches" d WHERE d."shopify_order_id" = o."id"
  AND d."stock_deducted" AND d."shipped_at" IS NOT NULL
);
