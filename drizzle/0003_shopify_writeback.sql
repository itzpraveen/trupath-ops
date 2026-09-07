ALTER TABLE "products" ADD COLUMN "shopify_inventory_item_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "shopify_tracked" boolean;--> statement-breakpoint
ALTER TABLE "shopify_stores" ADD COLUMN "push_inventory" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shopify_stores" ADD COLUMN "location_id" text;