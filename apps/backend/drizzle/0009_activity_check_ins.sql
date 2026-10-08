ALTER TABLE event_check_ins ADD CONSTRAINT event_check_ins_scope_uq UNIQUE (event_id, event_registration_id, id);--> statement-breakpoint
ALTER TABLE event_activity_registrations ADD CONSTRAINT event_activity_registrations_check_in_scope_uq UNIQUE (event_id, event_registration_id, activity_id, id);--> statement-breakpoint
CREATE TABLE "activity_check_ins" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "event_registration_id" uuid NOT NULL,
  "activity_id" uuid NOT NULL,
  "enrollment_id" uuid NOT NULL,
  "event_check_in_id" uuid NOT NULL,
  "actor_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "session_id" uuid NOT NULL REFERENCES "auth_sessions"("id"),
  "checked_in_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "activity_check_ins_pk" PRIMARY KEY ("id"),
  CONSTRAINT "activity_check_ins_registration_activity_uq" UNIQUE ("event_registration_id", "activity_id"),
  CONSTRAINT "activity_check_ins_enrollment_fk" FOREIGN KEY ("event_id", "event_registration_id", "activity_id", "enrollment_id") REFERENCES "event_activity_registrations"("event_id", "event_registration_id", "activity_id", "id") ON DELETE NO ACTION,
  CONSTRAINT "activity_check_ins_event_check_in_fk" FOREIGN KEY ("event_id", "event_registration_id", "event_check_in_id") REFERENCES "event_check_ins"("event_id", "event_registration_id", "id") ON DELETE NO ACTION
);--> statement-breakpoint
CREATE FUNCTION assert_activity_check_in() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE registration_status text;
BEGIN
  SELECT status INTO registration_status FROM event_registrations
    WHERE event_id = NEW.event_id AND id = NEW.event_registration_id FOR UPDATE;
  IF registration_status IS DISTINCT FROM 'confirmed' THEN
    RAISE EXCEPTION 'activity check-in requires a confirmed registration in this event';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth_sessions WHERE id = NEW.session_id AND user_id = NEW.actor_user_id) THEN
    RAISE EXCEPTION 'activity check-in actor must own the session';
  END IF;
  NEW.checked_in_at := clock_timestamp();
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER activity_check_ins_validate BEFORE INSERT ON activity_check_ins FOR EACH ROW EXECUTE FUNCTION assert_activity_check_in();--> statement-breakpoint
CREATE TRIGGER activity_check_ins_immutable BEFORE UPDATE OR DELETE ON activity_check_ins FOR EACH ROW EXECUTE FUNCTION prevent_event_check_in_change();
