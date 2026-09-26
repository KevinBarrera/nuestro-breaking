-- Lock the parent row while checking an activity so concurrent event window changes
-- cannot pass their own check against a stale set of activities.
CREATE FUNCTION assert_activity_event_window()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  event_start timestamptz;
  event_end timestamptz;
BEGIN
  SELECT starts_at, ends_at INTO event_start, event_end
  FROM events
  WHERE id = NEW.event_id
  FOR SHARE;

  -- The foreign key reports a missing event/membership.
  IF FOUND AND event_start IS NOT NULL AND
    (NEW.starts_at < event_start OR NEW.ends_at > event_end) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'activities_event_window_ck',
      MESSAGE = 'activities_event_window_ck: activity must fit inside event window';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER activities_event_window_ck
BEFORE INSERT OR UPDATE OF event_id, starts_at, ends_at ON activities
FOR EACH ROW
EXECUTE FUNCTION assert_activity_event_window();--> statement-breakpoint
CREATE FUNCTION assert_event_activities_window()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.starts_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM activities
    WHERE event_id = NEW.id
      AND (starts_at < NEW.starts_at OR ends_at > NEW.ends_at)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'events_activities_window_ck',
      MESSAGE = 'events_activities_window_ck: event window must contain its activities';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER events_activities_window_ck
BEFORE UPDATE OF starts_at, ends_at ON events
FOR EACH ROW
EXECUTE FUNCTION assert_event_activities_window();
