-- Complimentary confirmation (#263): an event administrator confirms, in person, a pending
-- registration whose pass price snapshots total $0, with a required reason in `note`. The audit
-- gains the `complimentary_confirmation` operation type and registrations the
-- `admin_complimentary` confirmation source. `registration_operation_audit_amount_ck` (0016) is
-- unchanged: the new operation is not a payment, so it carries no amount. The cash receipt index
-- (0029) is partial on `cash_confirmation`, so it does not apply.
ALTER TABLE "registration_operation_audit" DROP CONSTRAINT "registration_operation_audit_operation_type_check";--> statement-breakpoint
ALTER TABLE "registration_operation_audit" ADD CONSTRAINT "registration_operation_audit_operation_type_check" CHECK ("operation_type" IN ('manual_registration', 'cash_confirmation', 'pass_assignment', 'pass_selection_change', 'online_registration', 'payment_approval', 'registration_expiry', 'complimentary_confirmation'));--> statement-breakpoint
ALTER TABLE "event_registrations" DROP CONSTRAINT "event_registrations_confirmation_source_ck";--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_confirmation_source_ck" CHECK ("event_registrations"."confirmation_source" IS NULL OR "event_registrations"."confirmation_source" IN ('approved_payment', 'admin_cash', 'admin_complimentary'));
