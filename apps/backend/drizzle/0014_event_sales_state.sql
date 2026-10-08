-- Public address: a stable, lowercase kebab-case slug per event. Existing rows get a deterministic slug
-- derived from their id; the November catalog seed then assigns its readable slug. New rows without an
-- explicit slug get a random one of the same shape, so every insert keeps NOT NULL and UNIQUE.
ALTER TABLE "events" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "events" SET "slug" = 'event-' || replace("id"::text, '-', '');--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "slug" SET DEFAULT ('event-' || replace(gen_random_uuid()::text, '-', ''));--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_slug_uq" UNIQUE ("slug");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_slug_ck" CHECK (length("slug") <= 80 AND "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');--> statement-breakpoint
-- Sales state: an admin switch (closed by default) plus an optional window. Either date may be absent;
-- when both are set the opening must precede the closing.
ALTER TABLE "events" ADD COLUMN "sales_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "sales_opens_at" timestamptz;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "sales_closes_at" timestamptz;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_sales_window_ck" CHECK ("sales_opens_at" IS NULL OR "sales_closes_at" IS NULL OR "sales_opens_at" < "sales_closes_at");
