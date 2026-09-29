CREATE TABLE "participants" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"stage_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_pk" PRIMARY KEY("id"),
	CONSTRAINT "participants_full_name_ck" CHECK (length(btrim("participants"."full_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "event_registrations" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"folio" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_registrations_pk" PRIMARY KEY("id"),
	CONSTRAINT "event_registrations_event_id_id_uq" UNIQUE("event_id","id"),
	CONSTRAINT "event_registrations_event_participant_uq" UNIQUE("event_id","participant_id"),
	CONSTRAINT "event_registrations_event_folio_uq" UNIQUE("event_id","folio")
);
--> statement-breakpoint
CREATE TABLE "event_activity_registrations" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"event_registration_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_activity_registrations_pk" PRIMARY KEY("id"),
	CONSTRAINT "event_activity_registrations_registration_activity_uq" UNIQUE("event_registration_id","activity_id")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_event_id_id_uq" UNIQUE("event_id","id");--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_participant_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_activity_registrations" ADD CONSTRAINT "event_activity_registrations_registration_scope_fk" FOREIGN KEY ("event_id","event_registration_id") REFERENCES "public"."event_registrations"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_activity_registrations" ADD CONSTRAINT "event_activity_registrations_activity_scope_fk" FOREIGN KEY ("event_id","activity_id") REFERENCES "public"."activities"("event_id","id") ON DELETE no action ON UPDATE no action;
