-- Expired online registrations get their Mercado Pago payments searched once (#181 S6), so an
-- approval whose notifications never arrived is still applied. This records when that happened.
ALTER TABLE "event_registrations" ADD COLUMN "payments_reconciled_at" timestamp with time zone;
