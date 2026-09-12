CREATE TABLE "production_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"product_id" uuid NOT NULL,
	"brand_id" text NOT NULL,
	"qty" integer NOT NULL,
	"target_date" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"bom_id" uuid,
	"material_cost_p" bigint DEFAULT 0 NOT NULL,
	"labour_cost_p" bigint DEFAULT 0 NOT NULL,
	"shopify_order_id" text,
	"shopify_line_id" text,
	"note" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	CONSTRAINT "production_plans_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "production_entries" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_bom_id_boms_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."boms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_plans_status_idx" ON "production_plans" USING btree ("status","target_date");--> statement-breakpoint
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_plan_id_production_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."production_plans"("id") ON DELETE no action ON UPDATE no action;