ALTER TABLE "event_catalog_audit" DROP CONSTRAINT "event_catalog_audit_operation_ck";--> statement-breakpoint
ALTER TABLE "event_catalog_audit" ADD CONSTRAINT "event_catalog_audit_operation_ck" CHECK ("operation" IN ('create', 'update', 'archive', 'restore', 'access_change'));
