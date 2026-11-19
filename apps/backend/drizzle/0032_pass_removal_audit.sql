-- Pass removal (#282): an event administrator removes a held pass, with its selections, from an
-- in-person registration that is still pending payment. The audit gains the `pass_removal`
-- operation type. `registration_operation_audit_amount_ck` (0016) is unchanged: a removal is not a
-- payment, so it carries no amount.
ALTER TABLE "registration_operation_audit" DROP CONSTRAINT "registration_operation_audit_operation_type_check";--> statement-breakpoint
ALTER TABLE "registration_operation_audit" ADD CONSTRAINT "registration_operation_audit_operation_type_check" CHECK ("operation_type" IN ('manual_registration', 'cash_confirmation', 'pass_assignment', 'pass_selection_change', 'online_registration', 'payment_approval', 'registration_expiry', 'complimentary_confirmation', 'pass_removal'));
