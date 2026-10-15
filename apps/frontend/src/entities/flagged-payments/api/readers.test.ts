import { describe, expect, it } from 'vitest';
import { isFlaggedPayments } from './readers';

const payment = {
  providerPaymentId: '1234567890',
  reason: 'approved_after_expiry_duplicate',
  receivedAt: '2026-11-02T18:04:00.000Z',
  amountCents: 150000,
  registration: { id: 'r1', folio: null, participantName: 'Ana López', status: 'voided' },
};

describe('isFlaggedPayments', () => {
  it('accepts an empty list and a list of flagged payments', () => {
    expect(isFlaggedPayments({ payments: [] })).toBe(true);
    expect(
      isFlaggedPayments({
        payments: [
          payment,
          { ...payment, registration: { ...payment.registration, folio: 'LMP-1' } },
        ],
      }),
    ).toBe(true);
  });

  it('rejects unknown reasons and malformed rows', () => {
    expect(isFlaggedPayments(null)).toBe(false);
    expect(isFlaggedPayments({})).toBe(false);
    expect(isFlaggedPayments({ payments: [{ ...payment, reason: 'confirmed' }] })).toBe(false);
    expect(isFlaggedPayments({ payments: [{ ...payment, amountCents: '1500' }] })).toBe(false);
    expect(isFlaggedPayments({ payments: [{ ...payment, receivedAt: 'yesterday' }] })).toBe(false);
    expect(isFlaggedPayments({ payments: [{ ...payment, registration: null }] })).toBe(false);
    expect(
      isFlaggedPayments({
        payments: [{ ...payment, registration: { ...payment.registration, folio: 7 } }],
      }),
    ).toBe(false);
  });
});
