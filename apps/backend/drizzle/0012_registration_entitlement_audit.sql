ALTER TABLE "registration_operation_audit" DROP CONSTRAINT "registration_operation_audit_operation_type_check";--> statement-breakpoint
ALTER TABLE "registration_operation_audit" ADD CONSTRAINT "registration_operation_audit_operation_type_check" CHECK ("operation_type" IN ('manual_registration', 'cash_confirmation', 'pass_assignment', 'pass_selection_change'));
