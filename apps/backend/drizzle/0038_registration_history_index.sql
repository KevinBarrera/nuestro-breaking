-- Registration history (#104): event administrators read the event's audit facts newest first,
-- paginated by the `(created_at, id)` keyset. The index serves that read; the table had no
-- secondary index since `0036` dropped the `0029` receipt index.
CREATE INDEX "registration_operation_audit_event_created_idx" ON "registration_operation_audit" USING btree ("event_id","created_at" DESC,"id" DESC);
