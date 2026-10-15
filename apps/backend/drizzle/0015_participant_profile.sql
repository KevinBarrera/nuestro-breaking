-- Participant profile per #58: split name parts and optional buyer details. Every column is nullable
-- so existing participants and admin manual registration keep working; `full_name` stays NOT NULL as
-- the display name and is built from the parts when they are given. AKA stays `stage_name`.
-- Checks are immutable on purpose (no now()): text values must be non-blank and bounded when present.
ALTER TABLE "participants" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "first_last_name" text;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "second_last_name" text;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "instagram" text;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "level" text;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_first_name_ck" CHECK ("first_name" IS NULL OR (length(btrim("first_name")) > 0 AND length("first_name") <= 100));--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_first_last_name_ck" CHECK ("first_last_name" IS NULL OR (length(btrim("first_last_name")) > 0 AND length("first_last_name") <= 100));--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_second_last_name_ck" CHECK ("second_last_name" IS NULL OR (length(btrim("second_last_name")) > 0 AND length("second_last_name") <= 100));--> statement-breakpoint
-- The first name and first last name come together: either both are recorded or neither is.
ALTER TABLE "participants" ADD CONSTRAINT "participants_name_parts_ck" CHECK (("first_name" IS NULL) = ("first_last_name" IS NULL));--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_city_ck" CHECK ("city" IS NULL OR (length(btrim("city")) > 0 AND length("city") <= 100));--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_instagram_ck" CHECK ("instagram" IS NULL OR (length(btrim("instagram")) > 0 AND length("instagram") <= 64));--> statement-breakpoint
-- #58 does not define a closed set of levels, so the level is free text with a short bound.
ALTER TABLE "participants" ADD CONSTRAINT "participants_level_ck" CHECK ("level" IS NULL OR (length(btrim("level")) > 0 AND length("level") <= 50));--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_birth_date_ck" CHECK ("birth_date" IS NULL OR "birth_date" >= DATE '1900-01-01');
