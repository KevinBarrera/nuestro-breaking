-- Non-admin registration audit (D4 of #174). Every fact states its actor kind: an `admin` keeps a
-- required user and server-side session, while a `public` buyer and the `system` carry neither.
-- Existing facts were all written by administrators, so the backfill default is `admin`; the default
-- is dropped right after so every writer must state the kind explicitly.
ALTER TABLE "registration_operation_audit" ADD COLUMN "actor_kind" text NOT NULL DEFAULT 'admin';--> statement-breakpoint
ALTER TABLE "registration_operation_audit" ALTER COLUMN "actor_kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "registration_operation_audit" ADD CONSTRAINT "registration_operation_audit_actor_kind_check" CHECK ("actor_kind" IN ('admin', 'public', 'system'));--> statement-breakpoint
ALTER TABLE "registration_operation_audit" ALTER COLUMN "actor_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "registration_operation_audit" ALTER COLUMN "session_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "registration_operation_audit" ADD CONSTRAINT "registration_operation_audit_actor_ck" CHECK (CASE WHEN "actor_kind" = 'admin' THEN "actor_user_id" IS NOT NULL AND "session_id" IS NOT NULL ELSE "actor_user_id" IS NULL AND "session_id" IS NULL END);--> statement-breakpoint
-- `online_registration`: public creation of a pending registration with its passes and selections.
-- `payment_approval`: a verified online payment confirms a registration (#177).
ALTER TABLE "registration_operation_audit" DROP CONSTRAINT "registration_operation_audit_operation_type_check";--> statement-breakpoint
ALTER TABLE "registration_operation_audit" ADD CONSTRAINT "registration_operation_audit_operation_type_check" CHECK ("operation_type" IN ('manual_registration', 'cash_confirmation', 'pass_assignment', 'pass_selection_change', 'online_registration', 'payment_approval'));--> statement-breakpoint
-- Both confirmations record the amount received; every other operation has none.
ALTER TABLE "registration_operation_audit" DROP CONSTRAINT "registration_operation_audit_amount_ck";--> statement-breakpoint
ALTER TABLE "registration_operation_audit" ADD CONSTRAINT "registration_operation_audit_amount_ck" CHECK (("operation_type" IN ('cash_confirmation', 'payment_approval')) = ("amount_cents" IS NOT NULL));
