ALTER TABLE "job_work_orders" ADD COLUMN "billed_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Orders billed before per-batch billing existed were billed for everything received at the time.
UPDATE "job_work_orders" SET "billed_qty" = "received_qty" WHERE "billed_at" IS NOT NULL;
