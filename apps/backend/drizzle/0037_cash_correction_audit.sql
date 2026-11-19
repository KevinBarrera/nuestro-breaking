-- Cash correction (#104): an event administrator corrects the amount and/or receipt number of a
-- confirmed cash payment in `event_cash_payments` (0036), after checking the paper receipt, with a
-- mandatory reason in `note`. The audit gains the `cash_correction` operation type; its before and
-- after states hold the previous and new values.
-- `registration_operation_audit_amount_ck` (0016) is unchanged: the corrected amount lives in the
-- states, so `amount_cents` stays null and keeps meaning money received at confirmation.
ALTER TABLE "registration_operation_audit" DROP CONSTRAINT "registration_operation_audit_operation_type_check";--> statement-breakpoint
ALTER TABLE "registration_operation_audit" ADD CONSTRAINT "registration_operation_audit_operation_type_check" CHECK ("operation_type" IN ('manual_registration', 'cash_confirmation', 'pass_assignment', 'pass_selection_change', 'online_registration', 'payment_approval', 'registration_expiry', 'complimentary_confirmation', 'pass_removal', 'registration_void', 'registration_correction', 'registration_discipline_swap', 'cash_correction'));
