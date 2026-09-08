ALTER TABLE "material_movements" ADD COLUMN "work_date" date DEFAULT current_date NOT NULL;--> statement-breakpoint
-- Movements recorded before the date field existed belong to the day they were typed in (Indian time).
UPDATE "material_movements" SET "work_date" = ("created_at" AT TIME ZONE 'Asia/Kolkata')::date;
