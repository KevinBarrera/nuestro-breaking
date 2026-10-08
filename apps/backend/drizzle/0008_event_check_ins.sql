CREATE TABLE "event_check_ins" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "event_registration_id" uuid NOT NULL,
  "actor_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "session_id" uuid NOT NULL REFERENCES "auth_sessions"("id"),
  "checked_in_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "event_check_ins_pk" PRIMARY KEY ("id"),
  CONSTRAINT "event_check_ins_registration_uq" UNIQUE ("event_registration_id"),
  CONSTRAINT "event_check_ins_registration_scope_fk" FOREIGN KEY ("event_id", "event_registration_id") REFERENCES "event_registrations"("event_id", "id") ON DELETE NO ACTION
);--> statement-breakpoint
-- Lock the registration during insert so a concurrent state transition cannot race the status check.
-- Server owns the timestamp even for direct SQL inserts.
CREATE FUNCTION assert_event_check_in() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE registration_status text;
BEGIN
  SELECT status INTO registration_status FROM event_registrations
    WHERE event_id = NEW.event_id AND id = NEW.event_registration_id FOR UPDATE;
  IF registration_status IS DISTINCT FROM 'confirmed' THEN
    RAISE EXCEPTION 'event check-in requires a confirmed registration in this event';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth_sessions WHERE id = NEW.session_id AND user_id = NEW.actor_user_id) THEN
    RAISE EXCEPTION 'event check-in actor must own the session';
  END IF;
  NEW.checked_in_at := clock_timestamp();
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER event_check_ins_validate BEFORE INSERT ON event_check_ins FOR EACH ROW EXECUTE FUNCTION assert_event_check_in();--> statement-breakpoint
CREATE FUNCTION prevent_event_check_in_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'event check-in facts are immutable'; END;
$$;--> statement-breakpoint
CREATE TRIGGER event_check_ins_immutable BEFORE UPDATE OR DELETE ON event_check_ins FOR EACH ROW EXECUTE FUNCTION prevent_event_check_in_change();
