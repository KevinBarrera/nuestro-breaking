-- Per-pass online sales close (#240): after this time the pass cannot be bought online. Null means
-- the pass follows the event's sales window. Manual and cash registrations ignore it.
ALTER TABLE "event_pass_types" ADD COLUMN "online_sales_closes_at" timestamp with time zone;
