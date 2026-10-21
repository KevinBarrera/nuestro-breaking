-- Discipline swap (#104): an event administrator moves a registration's single full pass to another
-- full pass of the same current price, replacing its competitions, with a mandatory reason in
-- `note`. The audit gains the `registration_discipline_swap` operation type.
-- `registration_operation_audit_amount_ck` (0016) is unchanged: a swap charges nothing, so it
-- carries no amount.
ALTER TABLE "registration_operation_audit" DROP CONSTRAINT "registration_operation_audit_operation_type_check";--> statement-breakpoint
ALTER TABLE "registration_operation_audit" ADD CONSTRAINT "registration_operation_audit_operation_type_check" CHECK ("operation_type" IN ('manual_registration', 'cash_confirmation', 'pass_assignment', 'pass_selection_change', 'online_registration', 'payment_approval', 'registration_expiry', 'complimentary_confirmation', 'pass_removal', 'registration_void', 'registration_correction', 'registration_discipline_swap'));
