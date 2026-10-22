-- Cash payments (#104): the current amount and receipt number of a cash-confirmed registration, so a
-- correction can change them while `registration_operation_audit` stays the append-only history.
-- One row per registration; a receipt number is used once per event, compared exactly on the
-- stored trimmed text (`A-17` and `a-17` differ). Legacy confirmations without a receipt keep a
-- null receipt.
CREATE TABLE "event_cash_payments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "event_registration_id" uuid NOT NULL,
  "amount_cents" integer NOT NULL,
  "receipt" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "event_cash_payments_pk" PRIMARY KEY ("id"),
  CONSTRAINT "event_cash_payments_registration_uq" UNIQUE ("event_registration_id"),
  CONSTRAINT "event_cash_payments_registration_scope_fk" FOREIGN KEY ("event_id", "event_registration_id") REFERENCES "event_registrations"("event_id", "id") ON DELETE NO ACTION,
  CONSTRAINT "event_cash_payments_amount_cents_ck" CHECK ("amount_cents" > 0),
  CONSTRAINT "event_cash_payments_receipt_ck" CHECK ("receipt" IS NULL OR char_length("receipt") BETWEEN 1 AND 50)
);--> statement-breakpoint
CREATE UNIQUE INDEX "event_cash_payments_event_receipt_uq" ON "event_cash_payments" USING btree ("event_id", "receipt") WHERE "receipt" IS NOT NULL;--> statement-breakpoint
-- Backfill from the cash confirmation facts. Confirmation only happens from pending, so there is
-- one fact per registration; a second one would fail the unique constraint instead of being
-- guessed.
INSERT INTO "event_cash_payments" ("event_id", "event_registration_id", "amount_cents", "receipt", "created_at", "updated_at")
SELECT "event_id", "registration_id", "amount_cents", "receipt", "created_at", "created_at"
FROM "registration_operation_audit"
WHERE "operation_type" = 'cash_confirmation';--> statement-breakpoint
-- The payment table now reserves receipts; the audit keeps corrected-away receipts as history.
DROP INDEX "registration_operation_audit_cash_receipt_uq";
