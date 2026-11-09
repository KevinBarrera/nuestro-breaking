-- Competitor number assignment (#377): an administrator gives an eligible registration the next
-- number of one competition, before check-in or to replace (retire) its current one there. The
-- audit gains the `competitor_number_assignment` operation type; its before and after states hold
-- the competition and the previous number (null on a first assignment) and the new one.
-- Assignment on check-in is not audited: the activity check-in fact already records it.
ALTER TABLE "registration_operation_audit" DROP CONSTRAINT "registration_operation_audit_operation_type_check";--> statement-breakpoint
ALTER TABLE "registration_operation_audit" ADD CONSTRAINT "registration_operation_audit_operation_type_check" CHECK ("operation_type" IN ('manual_registration', 'cash_confirmation', 'pass_assignment', 'pass_selection_change', 'online_registration', 'payment_approval', 'registration_expiry', 'complimentary_confirmation', 'pass_removal', 'registration_void', 'registration_correction', 'registration_discipline_swap', 'cash_correction', 'competitor_number_assignment'));
