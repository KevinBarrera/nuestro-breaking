-- Participant name correction (#104): an event administrator corrects the name parts and the AKA
-- of a registration's participant, with a mandatory reason in `note`. The audit gains the
-- `registration_correction` operation type. `registration_operation_audit_amount_ck` (0016) is
-- unchanged: a correction is not a payment, so it carries no amount.
ALTER TABLE "registration_operation_audit" DROP CONSTRAINT "registration_operation_audit_operation_type_check";--> statement-breakpoint
ALTER TABLE "registration_operation_audit" ADD CONSTRAINT "registration_operation_audit_operation_type_check" CHECK ("operation_type" IN ('manual_registration', 'cash_confirmation', 'pass_assignment', 'pass_selection_change', 'online_registration', 'payment_approval', 'registration_expiry', 'complimentary_confirmation', 'pass_removal', 'registration_void', 'registration_correction'));
