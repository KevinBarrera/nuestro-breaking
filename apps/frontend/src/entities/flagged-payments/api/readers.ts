import { flaggedPaymentReasons, type FlaggedPayment, type FlaggedPayments } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function isFlaggedPayment(value: unknown): value is FlaggedPayment {
  if (!isRecord(value) || !isRecord(value.registration)) return false;
  const { registration } = value;
  return (
    typeof value.providerPaymentId === 'string' &&
    flaggedPaymentReasons.some((reason) => reason === value.reason) &&
    typeof value.receivedAt === 'string' &&
    !Number.isNaN(Date.parse(value.receivedAt)) &&
    typeof value.amountCents === 'number' &&
    typeof registration.id === 'string' &&
    (registration.folio === null || typeof registration.folio === 'string') &&
    typeof registration.participantName === 'string' &&
    typeof registration.status === 'string'
  );
}

export function isFlaggedPayments(value: unknown): value is FlaggedPayments {
  return isRecord(value) && Array.isArray(value.payments) && value.payments.every(isFlaggedPayment);
}
