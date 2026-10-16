-- Cash receipt numbers (#125): a new cash confirmation requires a receipt (trimmed, 1 to 50
-- characters, enforced by the API) that no other cash confirmation of the same event uses. The
-- comparison is exact on the stored trimmed text, so `A-17` and `a-17` differ. Earlier cash
-- confirmations without a receipt stay as legacy rows; the column stays nullable.
CREATE UNIQUE INDEX "registration_operation_audit_cash_receipt_uq" ON "registration_operation_audit" USING btree ("event_id", "receipt") WHERE "operation_type" = 'cash_confirmation' AND "receipt" IS NOT NULL;
