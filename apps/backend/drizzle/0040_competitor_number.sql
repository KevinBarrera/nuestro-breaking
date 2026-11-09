-- Competitor numbers (#377): one per registration and competition. A confirmed registration gets
-- a competition's number on its first check-in into that competition, or from an administrator.
-- Each competition numbers its competitors on its own (`MAX + 1` under a per-competition advisory
-- lock), so a number is never reused and gaps are expected. Existing registrations get no number.
CREATE TABLE "event_competitor_numbers" (
	"event_id" uuid NOT NULL,
	"event_registration_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"competitor_number" integer NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_competitor_numbers_pk" PRIMARY KEY("event_registration_id","activity_id"),
	CONSTRAINT "event_competitor_numbers_activity_number_uq" UNIQUE("activity_id","competitor_number"),
	CONSTRAINT "event_competitor_numbers_number_ck" CHECK ("event_competitor_numbers"."competitor_number" > 0)
);
--> statement-breakpoint
ALTER TABLE "event_competitor_numbers" ADD CONSTRAINT "event_competitor_numbers_registration_fk" FOREIGN KEY ("event_id","event_registration_id") REFERENCES "public"."event_registrations"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_competitor_numbers" ADD CONSTRAINT "event_competitor_numbers_activity_fk" FOREIGN KEY ("event_id","activity_id") REFERENCES "public"."activities"("event_id","id") ON DELETE no action ON UPDATE no action;
