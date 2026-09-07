CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"status" text NOT NULL,
	"check_in" text,
	"check_out" text,
	"overtime_min" integer DEFAULT 0 NOT NULL,
	"note" text,
	"user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"summary" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'bank' NOT NULL,
	"opening_p" bigint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bom_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bom_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"qty_per_unit" numeric(14, 3) NOT NULL,
	"wastage_pct" numeric(6, 2) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"version" text DEFAULT 'V1' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"labour_cost_p" bigint DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text,
	"entity_id" text NOT NULL,
	"kind" text NOT NULL,
	"work_date" date NOT NULL,
	"amount_p" bigint DEFAULT 0 NOT NULL,
	"taxable_p" bigint,
	"gst_p" bigint,
	"channel" text DEFAULT 'offline' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"contact_id" uuid,
	"payment_method" text DEFAULT 'cash' NOT NULL,
	"bank_account_id" uuid,
	"payment_terms" text DEFAULT 'paid' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_ref" text,
	"shopify_order_id" text,
	"note" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	CONSTRAINT "business_records_sourceRef_unique" UNIQUE("source_ref")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text DEFAULT 'customer' NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"gstin" text,
	"state_code" text,
	"address" text,
	"notes" text,
	"shopify_customer_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatch_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"qty" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"brand_id" text NOT NULL,
	"entity_id" text DEFAULT 'brand' NOT NULL,
	"order_ref" text DEFAULT '' NOT NULL,
	"shopify_order_id" text,
	"contact_id" uuid,
	"customer_name" text NOT NULL,
	"phone" text,
	"address" text,
	"dispatch_date" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"courier" text,
	"tracking_no" text,
	"tracking_url" text,
	"amount_p" bigint DEFAULT 0 NOT NULL,
	"note" text,
	"stock_deducted" boolean DEFAULT false NOT NULL,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispatches_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"designation" text DEFAULT '' NOT NULL,
	"phone" text,
	"joined_at" date,
	"daily_wage_p" bigint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"gstin" text,
	"address" text,
	"state_code" text,
	"phone" text,
	"email" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_work_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"qty_sent" numeric(14, 3) DEFAULT 0 NOT NULL,
	"qty_returned" numeric(14, 3) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"entity_id" text DEFAULT 'factory' NOT NULL,
	"vendor_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"due_date" date,
	"process" text DEFAULT 'Stitching' NOT NULL,
	"product_id" uuid,
	"description" text DEFAULT '' NOT NULL,
	"ordered_qty" integer DEFAULT 0 NOT NULL,
	"received_qty" integer DEFAULT 0 NOT NULL,
	"rejected_qty" integer DEFAULT 0 NOT NULL,
	"rate_per_unit_p" bigint DEFAULT 0 NOT NULL,
	"tax_bps" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"note" text,
	"billed_at" timestamp with time zone,
	"bill_record_id" uuid,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_work_orders_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "job_work_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"receipt_date" date NOT NULL,
	"accepted_qty" integer DEFAULT 0 NOT NULL,
	"rejected_qty" integer DEFAULT 0 NOT NULL,
	"note" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"before_qty" numeric(14, 3) NOT NULL,
	"after_qty" numeric(14, 3) NOT NULL,
	"unit_cost_p" bigint,
	"ref_type" text,
	"ref_id" text,
	"note" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit" text DEFAULT 'metres' NOT NULL,
	"qty" numeric(14, 3) DEFAULT 0 NOT NULL,
	"min_qty" numeric(14, 3) DEFAULT 0 NOT NULL,
	"cost_p" bigint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_count_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "materials_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "number_counters" (
	"series_key" text NOT NULL,
	"period_key" text NOT NULL,
	"next" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "number_counters_series_key_period_key_pk" PRIMARY KEY("series_key","period_key")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"entity_id" text NOT NULL,
	"direction" text NOT NULL,
	"work_date" date NOT NULL,
	"amount_p" bigint DEFAULT 0 NOT NULL,
	"contact_id" uuid,
	"bank_account_id" uuid,
	"method" text DEFAULT 'bank' NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"record_id" uuid,
	"job_work_order_id" uuid,
	"note" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	CONSTRAINT "payments_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "production_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"work_date" date NOT NULL,
	"product_id" uuid NOT NULL,
	"brand_id" text NOT NULL,
	"qty" integer NOT NULL,
	"bom_id" uuid,
	"employee_id" uuid,
	"worker_name" text,
	"material_cost_p" bigint DEFAULT 0 NOT NULL,
	"labour_cost_p" bigint DEFAULT 0 NOT NULL,
	"note" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	CONSTRAINT "production_entries_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"variant" text DEFAULT '' NOT NULL,
	"sku" text,
	"category" text,
	"shopify_product_id" text,
	"shopify_variant_id" text,
	"image_url" text,
	"price_p" bigint DEFAULT 0 NOT NULL,
	"cost_p" bigint DEFAULT 0 NOT NULL,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"stock_qty" integer DEFAULT 0 NOT NULL,
	"min_stock" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"order_number" integer,
	"created_at_shop" timestamp with time zone NOT NULL,
	"updated_at_shop" timestamp with time zone NOT NULL,
	"financial_status" text DEFAULT '' NOT NULL,
	"fulfillment_status" text DEFAULT '' NOT NULL,
	"customer_name" text DEFAULT '' NOT NULL,
	"email" text,
	"phone" text,
	"shipping_address" jsonb,
	"city" text,
	"province" text,
	"total_p" bigint DEFAULT 0 NOT NULL,
	"subtotal_p" bigint DEFAULT 0 NOT NULL,
	"discount_p" bigint DEFAULT 0 NOT NULL,
	"shipping_p" bigint DEFAULT 0 NOT NULL,
	"tax_p" bigint DEFAULT 0 NOT NULL,
	"refunded_p" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"gateway" text,
	"tags" text DEFAULT '' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"closed_at" timestamp with time zone,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stock_deducted" boolean DEFAULT false NOT NULL,
	"stock_restored" boolean DEFAULT false NOT NULL,
	"note" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"qty" integer NOT NULL,
	"before_qty" integer NOT NULL,
	"after_qty" integer NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"note" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'shopify' NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"orders_upserted" integer DEFAULT 0 NOT NULL,
	"products_upserted" integer DEFAULT 0 NOT NULL,
	"message" text
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'factory' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_bom_id_boms_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."boms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_records" ADD CONSTRAINT "business_records_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_records" ADD CONSTRAINT "business_records_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_records" ADD CONSTRAINT "business_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD CONSTRAINT "dispatch_items_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD CONSTRAINT "dispatch_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_work_materials" ADD CONSTRAINT "job_work_materials_order_id_job_work_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."job_work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_work_materials" ADD CONSTRAINT "job_work_materials_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_work_orders" ADD CONSTRAINT "job_work_orders_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_work_orders" ADD CONSTRAINT "job_work_orders_vendor_id_contacts_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_work_orders" ADD CONSTRAINT "job_work_orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_work_orders" ADD CONSTRAINT "job_work_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_work_receipts" ADD CONSTRAINT "job_work_receipts_order_id_job_work_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."job_work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_work_receipts" ADD CONSTRAINT "job_work_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_movements" ADD CONSTRAINT "material_movements_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_movements" ADD CONSTRAINT "material_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_record_id_business_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."business_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_job_work_order_id_job_work_orders_id_fk" FOREIGN KEY ("job_work_order_id") REFERENCES "public"."job_work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_bom_id_boms_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."boms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_emp_date_idx" ON "attendance" USING btree ("employee_id","work_date");--> statement-breakpoint
CREATE INDEX "attendance_date_idx" ON "attendance" USING btree ("work_date");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "boms_product_idx" ON "boms" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "records_entity_date_idx" ON "business_records" USING btree ("entity_id","work_date");--> statement-breakpoint
CREATE INDEX "records_kind_idx" ON "business_records" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "records_shopify_idx" ON "business_records" USING btree ("shopify_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_kind_name_idx" ON "categories" USING btree ("kind","name");--> statement-breakpoint
CREATE INDEX "contacts_type_idx" ON "contacts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "contacts_name_idx" ON "contacts" USING btree ("name");--> statement-breakpoint
CREATE INDEX "dispatches_status_idx" ON "dispatches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dispatches_date_idx" ON "dispatches" USING btree ("dispatch_date");--> statement-breakpoint
CREATE INDEX "jobwork_vendor_idx" ON "job_work_orders" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "jobwork_status_idx" ON "job_work_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "material_movements_material_idx" ON "material_movements" USING btree ("material_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_entity_date_idx" ON "payments" USING btree ("entity_id","work_date");--> statement-breakpoint
CREATE INDEX "payments_contact_idx" ON "payments" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "production_date_idx" ON "production_entries" USING btree ("work_date");--> statement-breakpoint
CREATE UNIQUE INDEX "products_shopify_variant_idx" ON "products" USING btree ("shopify_variant_id");--> statement-breakpoint
CREATE INDEX "products_sku_idx" ON "products" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "products_brand_idx" ON "products" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shopify_orders_created_idx" ON "shopify_orders" USING btree ("created_at_shop");--> statement-breakpoint
CREATE INDEX "shopify_orders_status_idx" ON "shopify_orders" USING btree ("financial_status","fulfillment_status");--> statement-breakpoint
CREATE INDEX "stock_movements_product_idx" ON "stock_movements" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "uploads_ref_idx" ON "uploads" USING btree ("kind","ref_id");