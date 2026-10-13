-- Venue management from the admin panel (#213 D8): the event audit also records venues created for
-- an event and venues renamed, so the action check gains `venue_created` and `venue_updated`.
ALTER TABLE "event_admin_audit" DROP CONSTRAINT "event_admin_audit_action_ck";--> statement-breakpoint
ALTER TABLE "event_admin_audit" ADD CONSTRAINT "event_admin_audit_action_ck" CHECK ("action" IN ('created', 'updated', 'archived', 'restored', 'deleted', 'venue_created', 'venue_updated'));
