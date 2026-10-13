-- Unpaid online registrations expire (#181 S1): each online pending registration records when it
-- expires. Admin manual registrations keep a null expiry and never expire on their own.
ALTER TABLE "event_registrations" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
-- Online pending registrations created before this migration get the default window (72 payment
-- hours plus one day) counted from their last change, so none of them stays pending forever. A
-- manual registration later reused by an online buyer also has an online fact; it is left out.
UPDATE "event_registrations" AS r SET "expires_at" = r."updated_at" + interval '96 hours'
WHERE r."status" = 'pending_payment'
  AND EXISTS (
    SELECT 1 FROM "registration_operation_audit" AS a
    WHERE a."registration_id" = r."id" AND a."operation_type" = 'online_registration'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "registration_operation_audit" AS a
    WHERE a."registration_id" = r."id" AND a."operation_type" = 'manual_registration'
  );
