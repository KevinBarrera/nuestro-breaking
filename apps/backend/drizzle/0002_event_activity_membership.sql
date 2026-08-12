CREATE TABLE "event_venues" (
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	CONSTRAINT "event_venues_pk" PRIMARY KEY("event_id","venue_id")
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	CONSTRAINT "activities_pk" PRIMARY KEY("id"),
	CONSTRAINT "activities_kind_ck" CHECK (length(btrim("activities"."kind")) > 0),
	CONSTRAINT "activities_name_ck" CHECK (length(btrim("activities"."name")) > 0),
	CONSTRAINT "activities_window_ck" CHECK ("activities"."starts_at" < "activities"."ends_at")
);
--> statement-breakpoint
ALTER TABLE "event_venues" ADD CONSTRAINT "event_venues_event_scope_fk" FOREIGN KEY ("organization_id","event_id") REFERENCES "public"."events"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_venues" ADD CONSTRAINT "event_venues_venue_scope_fk" FOREIGN KEY ("organization_id","venue_id") REFERENCES "public"."venues"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_event_venue_fk" FOREIGN KEY ("event_id","venue_id") REFERENCES "public"."event_venues"("event_id","venue_id") ON DELETE no action ON UPDATE no action;