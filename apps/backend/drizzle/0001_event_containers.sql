CREATE TABLE "organizations" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "organizations_pk" PRIMARY KEY("id"),
	CONSTRAINT "organizations_name_ck" CHECK (length(btrim("organizations"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "venues_pk" PRIMARY KEY("id"),
	CONSTRAINT "venues_organization_id_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "venues_name_ck" CHECK (length(btrim("venues"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"time_zone" text NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	CONSTRAINT "events_pk" PRIMARY KEY("id"),
	CONSTRAINT "events_organization_id_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "events_name_ck" CHECK (length(btrim("events"."name")) > 0),
	CONSTRAINT "events_window_ck" CHECK ((
        ("events"."starts_at" IS NULL AND "events"."ends_at" IS NULL)
        OR (
          "events"."starts_at" IS NOT NULL
          AND "events"."ends_at" IS NOT NULL
          AND "events"."starts_at" < "events"."ends_at"
        )
      ))
);
--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_event_time_zone()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_timezone_names
    WHERE name = NEW.time_zone
  ) THEN
    RAISE invalid_parameter_value;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN invalid_parameter_value THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'events_time_zone_ck',
      MESSAGE = 'events_time_zone_ck: time_zone must be a PostgreSQL IANA zone name';
END;
$$;--> statement-breakpoint
CREATE TRIGGER events_time_zone_ck
BEFORE INSERT OR UPDATE OF time_zone ON events
FOR EACH ROW
EXECUTE FUNCTION assert_event_time_zone();
