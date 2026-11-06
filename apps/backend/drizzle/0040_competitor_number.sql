-- Competitor number (#377): a per-event number for every competitor, assigned on the first event
-- or activity check-in of an eligible registration, or by an administrator. It is always the
-- event's highest number plus one under a per-event advisory lock, so a number is never handed to
-- anyone else and gaps are expected. Existing registrations get no number.
ALTER TABLE "event_registrations" ADD COLUMN "competitor_number" integer;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_competitor_number_uq" UNIQUE ("event_id", "competitor_number");--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_competitor_number_ck" CHECK ("event_registrations"."competitor_number" IS NULL OR "event_registrations"."competitor_number" > 0);
