-- Registration folio (D2, D3 of #174): `<PREFIX>-<CODE>`, random, unique across the whole system,
-- assigned once when a registration becomes `confirmed` and never edited afterwards.
-- Each event owns a short uppercase prefix. Existing events get `EV`; the November catalog seed then
-- replaces that default with `LMP`. The default stays so inserts without a prefix keep working.
ALTER TABLE "events" ADD COLUMN "folio_prefix" text DEFAULT 'EV' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_folio_prefix_ck" CHECK ("folio_prefix" ~ '^[A-Z][A-Z0-9]{1,5}$');--> statement-breakpoint
-- Folios are unique system-wide (NULLs stay distinct), which supersedes the per-event constraint.
ALTER TABLE "event_registrations" DROP CONSTRAINT "event_registrations_event_folio_uq";--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_folio_uq" UNIQUE ("folio");--> statement-breakpoint
-- Database-side generator with the same alphabet and length as `registration-folio.ts`. The application
-- generates folios itself; this one serves the backfill below and the trigger backstop.
CREATE FUNCTION generate_registration_folio(prefix text) RETURNS text LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  candidate text;
BEGIN
  FOR attempt IN 1..20 LOOP
    candidate := prefix || '-';
    FOR character_index IN 1..4 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM event_registrations WHERE folio = candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'could not generate a unique registration folio for prefix %', prefix;
END;
$$;--> statement-breakpoint
-- Confirmed registrations written before folios existed get one now, one row per statement so each
-- uniqueness check sees the folios assigned before it.
DO $$
DECLARE
  registration record;
BEGIN
  FOR registration IN
    SELECT r.id, e.folio_prefix FROM event_registrations r JOIN events e ON e.id = r.event_id
    WHERE r.status = 'confirmed' AND r.folio IS NULL ORDER BY r.confirmed_at, r.id
  LOOP
    UPDATE event_registrations SET folio = generate_registration_folio(registration.folio_prefix)
    WHERE id = registration.id;
  END LOOP;
END;
$$;--> statement-breakpoint
-- A confirmed registration always has a folio and a pending one never does. A voided registration may
-- keep the folio it received when it was confirmed.
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_folio_status_ck" CHECK (("status" = 'confirmed' AND "folio" IS NOT NULL) OR ("status" = 'pending_payment' AND "folio" IS NULL) OR "status" = 'voided');--> statement-breakpoint
-- Immutability: once set, a folio cannot change or be cleared. Backstop: a write that confirms a
-- registration without a folio (raw SQL, fixtures) gets one from the event prefix. Concurrent backstop
-- writes may still collide on the unique constraint; the application path retries instead.
CREATE FUNCTION guard_event_registration_folio() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.folio IS NOT NULL AND NEW.folio IS DISTINCT FROM OLD.folio THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      CONSTRAINT = 'event_registrations_folio_immutable',
      MESSAGE = 'registration folio is immutable';
  END IF;
  IF NEW.status = 'confirmed' AND NEW.folio IS NULL THEN
    NEW.folio := generate_registration_folio((SELECT folio_prefix FROM events WHERE id = NEW.event_id));
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER event_registrations_folio_guard BEFORE INSERT OR UPDATE ON event_registrations FOR EACH ROW EXECUTE FUNCTION guard_event_registration_folio();
