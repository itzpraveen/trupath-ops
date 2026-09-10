ALTER TABLE "products" ADD COLUMN "catalogue_ref" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "hsn_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "requires_component_billing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Older codes have no provenance. Preserve them until an operator explicitly clears or replaces them.
UPDATE "products" SET "hsn_locked" = true WHERE nullif(btrim("hsn_code"), '') IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "products_brand_catalogue_idx" ON "products" USING btree ("brand_id","catalogue_ref");
