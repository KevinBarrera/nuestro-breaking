ALTER TABLE "participants" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_phone_ck" CHECK ("phone" IS NULL OR length(btrim("phone")) > 0);--> statement-breakpoint
CREATE TABLE "registration_operation_audit" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "operation_type" text NOT NULL CHECK ("operation_type" IN ('manual_registration', 'cash_confirmation')),
  "outcome" text NOT NULL DEFAULT 'accepted' CHECK ("outcome" = 'accepted'),
  "actor_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "session_id" uuid NOT NULL REFERENCES "auth_sessions"("id"),
  "event_id" uuid NOT NULL REFERENCES "events"("id"),
  "registration_id" uuid NOT NULL REFERENCES "event_registrations"("id"),
  "participant_id" uuid NOT NULL REFERENCES "participants"("id"),
  "affected_activity_ids" uuid[] NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "amount_cents" integer CHECK ("amount_cents" IS NULL OR "amount_cents" > 0),
  "reference" text, "note" text, "receipt" text,
  "before_state" jsonb NOT NULL,
  "after_state" jsonb NOT NULL,
  "facts" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "registration_operation_audit_amount_ck" CHECK (("operation_type" = 'cash_confirmation') = ("amount_cents" IS NOT NULL))
);--> statement-breakpoint
CREATE FUNCTION prevent_registration_operation_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'registration operation facts are immutable'; END;
$$;--> statement-breakpoint
CREATE TRIGGER registration_operation_audit_immutable BEFORE UPDATE OR DELETE ON registration_operation_audit FOR EACH ROW EXECUTE FUNCTION prevent_registration_operation_audit_change();
