-- Event location (#322): where the event happens. Existing events get no location (it is not
-- derived from the time zone); an admin fills it in. The three columns are set together.
ALTER TABLE "events" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_location_ck" CHECK ((
  ("events"."city" IS NULL AND "events"."state" IS NULL AND "events"."country" IS NULL)
  OR (
    length(btrim("events"."city")) > 0
    AND length(btrim("events"."state")) > 0
    AND "events"."country" ~ '^[A-Z]{2}$'
  )
));
