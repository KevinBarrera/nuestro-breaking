CREATE OR REPLACE FUNCTION assert_activity_check_in() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE registration_status text;
BEGIN
  SELECT status INTO registration_status FROM event_registrations
    WHERE event_id = NEW.event_id AND id = NEW.event_registration_id FOR UPDATE;
  IF registration_status IS DISTINCT FROM 'confirmed' THEN
    RAISE EXCEPTION 'activity check-in requires a confirmed registration in this event';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM activities
    WHERE event_id = NEW.event_id AND id = NEW.activity_id
      AND kind IN ('workshop', 'battle', 'competition')
  ) THEN
    RAISE EXCEPTION 'activity check-in requires a workshop or competition';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth_sessions WHERE id = NEW.session_id AND user_id = NEW.actor_user_id) THEN
    RAISE EXCEPTION 'activity check-in actor must own the session';
  END IF;
  NEW.checked_in_at := clock_timestamp();
  RETURN NEW;
END;
$$;
