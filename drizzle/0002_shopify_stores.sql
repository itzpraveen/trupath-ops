CREATE TABLE "shopify_stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop" text NOT NULL,
	"label" text NOT NULL,
	"brand_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"channel" text DEFAULT 'Own website' NOT NULL,
	"client_id" text,
	"client_secret_enc" text,
	"token_enc" text,
	"scope" text,
	"installed_at" timestamp with time zone,
	"baseline_at" timestamp with time zone,
	"webhooks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopify_stores_shop_unique" UNIQUE("shop")
);
--> statement-breakpoint
ALTER TABLE "shopify_orders" ADD COLUMN "shop" text;--> statement-breakpoint
ALTER TABLE "shopify_orders" ADD COLUMN "brand_id" text;--> statement-breakpoint
ALTER TABLE "shopify_orders" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "shop" text;--> statement-breakpoint
ALTER TABLE "shopify_stores" ADD CONSTRAINT "shopify_stores_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopify_stores" ADD CONSTRAINT "shopify_stores_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shopify_orders_shop_idx" ON "shopify_orders" USING btree ("shop");