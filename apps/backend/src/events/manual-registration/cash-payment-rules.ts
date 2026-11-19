import { ConflictException } from '@nestjs/common';

// Bounds of a cash payment, shared by its confirmation and its correction (#104): the amount in
// cents fits the `integer` column, and the paper receipt number (#125) is stored trimmed.
export const CASH_AMOUNT_MAX_CENTS = 2147483647;
export const CASH_RECEIPT_MAX = 50;

// The unique index that reserves a receipt number within an event (migration 0036).
export const CASH_RECEIPT_UNIQUE = 'event_cash_payments_event_receipt_uq';

export function isCashAmount(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) > 0 &&
    (value as number) <= CASH_AMOUNT_MAX_CENTS
  );
}

export function receiptTaken() {
  return new ConflictException({
    statusCode: 409,
    message: 'Receipt number already used in this event',
    code: 'receipt_taken',
  });
}
