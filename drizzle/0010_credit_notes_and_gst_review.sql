CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"number" text NOT NULL,
	"seller_gstin" text NOT NULL,
	"issued_on" date NOT NULL,
	"reason" text NOT NULL,
	"lines" jsonb NOT NULL,
	"taxable_p" bigint DEFAULT 0 NOT NULL,
	"cgst_p" bigint DEFAULT 0 NOT NULL,
	"sgst_p" bigint DEFAULT 0 NOT NULL,
	"igst_p" bigint DEFAULT 0 NOT NULL,
	"round_off_p" bigint DEFAULT 0 NOT NULL,
	"total_p" bigint DEFAULT 0 NOT NULL,
	"record_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_notes_requestId_unique" UNIQUE("request_id")
);
--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "shipping_tax_treatment" text DEFAULT 'goods' NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "e_invoice_status" text DEFAULT 'unconfirmed' NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "e_invoice_review" text;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_record_id_business_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."business_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_gstin_number_unique" ON "credit_notes" USING btree ("seller_gstin","number");--> statement-breakpoint
CREATE INDEX "credit_notes_invoice_idx" ON "credit_notes" USING btree ("invoice_id");