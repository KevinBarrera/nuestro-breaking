ALTER TABLE "activities" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_status_ck" CHECK ("status" IN ('active', 'archived'));--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_version_ck" CHECK ("version" > 0);--> statement-breakpoint
-- An add-on may require holding a pass of another class (Open Styles requires a full pass); other classes carry no rule.
CREATE TABLE "event_pass_types" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "name" text NOT NULL,
  "pass_class" text NOT NULL,
  "price_cents" integer NOT NULL,
  "requires_pass_class" text,
  "status" text DEFAULT 'active' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "event_pass_types_pk" PRIMARY KEY ("id"),
  CONSTRAINT "event_pass_types_event_id_id_uq" UNIQUE ("event_id", "id"),
  CONSTRAINT "event_pass_types_event_fk" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE NO ACTION,
  CONSTRAINT "event_pass_types_name_ck" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "event_pass_types_pass_class_ck" CHECK ("pass_class" IN ('full', 'general', 'add_on')),
  CONSTRAINT "event_pass_types_price_cents_ck" CHECK ("price_cents" >= 0),
  CONSTRAINT "event_pass_types_requires_pass_class_ck" CHECK ("requires_pass_class" IS NULL OR ("pass_class" = 'add_on' AND "requires_pass_class" IN ('full', 'general'))),
  CONSTRAINT "event_pass_types_status_ck" CHECK ("status" IN ('active', 'archived')),
  CONSTRAINT "event_pass_types_version_ck" CHECK ("version" > 0)
);--> statement-breakpoint
CREATE UNIQUE INDEX "event_pass_types_event_active_name_uq" ON "event_pass_types" ("event_id", lower(btrim("name"))) WHERE "status" = 'active';--> statement-breakpoint
CREATE TABLE "event_pass_type_activities" (
  "event_id" uuid NOT NULL,
  "pass_type_id" uuid NOT NULL,
  "activity_id" uuid NOT NULL,
  "access" text NOT NULL,
  CONSTRAINT "event_pass_type_activities_pk" PRIMARY KEY ("event_id", "pass_type_id", "activity_id"),
  CONSTRAINT "event_pass_type_activities_pass_type_scope_fk" FOREIGN KEY ("event_id", "pass_type_id") REFERENCES "event_pass_types"("event_id", "id") ON DELETE NO ACTION,
  CONSTRAINT "event_pass_type_activities_activity_scope_fk" FOREIGN KEY ("event_id", "activity_id") REFERENCES "activities"("event_id", "id") ON DELETE NO ACTION,
  CONSTRAINT "event_pass_type_activities_access_ck" CHECK ("access" IN ('selectable', 'included'))
);--> statement-breakpoint
CREATE TABLE "event_registration_passes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "event_registration_id" uuid NOT NULL,
  "pass_type_id" uuid NOT NULL,
  "price_cents" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "event_registration_passes_pk" PRIMARY KEY ("id"),
  CONSTRAINT "event_registration_passes_event_id_id_uq" UNIQUE ("event_id", "id"),
  CONSTRAINT "event_registration_passes_registration_pass_type_uq" UNIQUE ("event_registration_id", "pass_type_id"),
  CONSTRAINT "event_registration_passes_registration_scope_fk" FOREIGN KEY ("event_id", "event_registration_id") REFERENCES "event_registrations"("event_id", "id") ON DELETE NO ACTION,
  CONSTRAINT "event_registration_passes_pass_type_scope_fk" FOREIGN KEY ("event_id", "pass_type_id") REFERENCES "event_pass_types"("event_id", "id") ON DELETE NO ACTION,
  CONSTRAINT "event_registration_passes_price_cents_ck" CHECK ("price_cents" >= 0)
);--> statement-breakpoint
-- Whether the activity is selectable for the purchased pass type is enforced by the entitlement service.
CREATE TABLE "event_registration_pass_selections" (
  "event_id" uuid NOT NULL,
  "registration_pass_id" uuid NOT NULL,
  "activity_id" uuid NOT NULL,
  CONSTRAINT "event_registration_pass_selections_pk" PRIMARY KEY ("event_id", "registration_pass_id", "activity_id"),
  CONSTRAINT "event_registration_pass_selections_registration_pass_scope_fk" FOREIGN KEY ("event_id", "registration_pass_id") REFERENCES "event_registration_passes"("event_id", "id") ON DELETE NO ACTION,
  CONSTRAINT "event_registration_pass_selections_activity_scope_fk" FOREIGN KEY ("event_id", "activity_id") REFERENCES "activities"("event_id", "id") ON DELETE NO ACTION
);--> statement-breakpoint
-- Catalog facts hold catalog state only, never personal data.
CREATE TABLE "event_catalog_audit" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "actor_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "actor_session_id" uuid NOT NULL REFERENCES "auth_sessions"("id"),
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "operation" text NOT NULL,
  "before" jsonb,
  "after" jsonb,
  "occurred_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "event_catalog_audit_pk" PRIMARY KEY ("id"),
  CONSTRAINT "event_catalog_audit_event_fk" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE NO ACTION,
  CONSTRAINT "event_catalog_audit_entity_type_ck" CHECK ("entity_type" IN ('activity', 'pass_type')),
  CONSTRAINT "event_catalog_audit_operation_ck" CHECK ("operation" IN ('create', 'update', 'archive', 'access_change')),
  CONSTRAINT "event_catalog_audit_state_ck" CHECK (("operation" = 'create' AND "before" IS NULL AND "after" IS NOT NULL) OR ("operation" <> 'create' AND "before" IS NOT NULL AND "after" IS NOT NULL))
);--> statement-breakpoint
CREATE FUNCTION prevent_event_catalog_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'catalog audit facts are immutable'; END;
$$;--> statement-breakpoint
CREATE TRIGGER event_catalog_audit_immutable BEFORE UPDATE OR DELETE ON event_catalog_audit FOR EACH ROW EXECUTE FUNCTION prevent_event_catalog_audit_change();
