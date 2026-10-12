-- Event lifecycle from the admin panel (#213 D4, D6). An archived event keeps its data but is hidden
-- from the public pages; restoring clears the mark.
ALTER TABLE "events" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
-- Event audit: who created, edited, archived, restored or deleted an event. `event_id` has no foreign
-- key and the row keeps the slug and name, so the `deleted` row outlives the event it describes.
-- Every action comes from an admin session.
CREATE TABLE "event_admin_audit" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "event_slug" text NOT NULL,
  "event_name" text NOT NULL,
  "action" text NOT NULL,
  "actor_user_id" uuid NOT NULL,
  "actor_session_id" uuid NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "event_admin_audit_pk" PRIMARY KEY("id"),
  CONSTRAINT "event_admin_audit_action_ck" CHECK ("action" IN ('created', 'updated', 'archived', 'restored', 'deleted')),
  CONSTRAINT "event_admin_audit_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "event_admin_audit_session_fk" FOREIGN KEY ("actor_session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE no action ON UPDATE no action
);--> statement-breakpoint
-- An event's history is read oldest to newest.
CREATE INDEX "event_admin_audit_event_created_idx" ON "event_admin_audit" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE FUNCTION prevent_event_admin_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'event admin audit facts are immutable'; END;
$$;--> statement-breakpoint
CREATE TRIGGER event_admin_audit_immutable BEFORE UPDATE OR DELETE ON event_admin_audit FOR EACH ROW EXECUTE FUNCTION prevent_event_admin_audit_change();
