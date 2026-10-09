import { decidePayment, type PaymentDecisionInput } from './payment-decision';

const PENDING = {
  status: 'pending_payment',
  expectedAmountCents: 150050,
  confirmedByThisPayment: false,
} as const;
const APPROVED = {
  status: 'approved',
  transactionAmountCents: 150050,
  currencyId: 'MXN',
};

const decide = (overrides: Partial<PaymentDecisionInput> = {}) =>
  decidePayment({ payment: APPROVED, registration: PENDING, ...overrides });

describe('decidePayment', () => {
  it('confirms a pending registration paid in full and in MXN', () => {
    expect(decide()).toEqual({ outcome: 'confirmed', confirm: true, recordPayment: true });
  });

  it('flags an approval on a registration that another confirmation already settled', () => {
    expect(decide({ registration: { ...PENDING, status: 'confirmed' } })).toEqual({
      outcome: 'approved_after_confirmation',
      confirm: false,
      recordPayment: true,
    });
  });

  it('treats a repeat approval of the payment that confirmed the registration as settled', () => {
    expect(
      decide({ registration: { ...PENDING, status: 'confirmed', confirmedByThisPayment: true } }),
    ).toEqual({ outcome: 'already_confirmed', confirm: false, recordPayment: true });
  });

  it('flags an approval on a voided registration', () => {
    expect(decide({ registration: { ...PENDING, status: 'voided' } })).toEqual({
      outcome: 'approved_after_void',
      confirm: false,
      recordPayment: true,
    });
  });

  it.each(['pending', 'in_process', 'authorized'])(
    'keeps the registration pending on %s',
    (status) => {
      expect(decide({ payment: { ...APPROVED, status } })).toEqual({
        outcome: `payment_${status}`,
        confirm: false,
        recordPayment: true,
      });
    },
  );

  it.each(['rejected', 'cancelled'])(
    'keeps the registration pending on %s so the buyer can retry',
    (status) => {
      expect(decide({ payment: { ...APPROVED, status } })).toEqual({
        outcome: `payment_${status}`,
        confirm: false,
        recordPayment: true,
      });
    },
  );

  it.each(['refunded', 'charged_back', 'in_mediation'])(
    'only records %s and never undoes a confirmation',
    (status) => {
      for (const registrationStatus of ['pending_payment', 'confirmed']) {
        expect(
          decide({
            payment: { ...APPROVED, status },
            registration: { ...PENDING, status: registrationStatus },
          }),
        ).toEqual({ outcome: `payment_${status}`, confirm: false, recordPayment: true });
      }
    },
  );

  it('records an amount mismatch without confirming', () => {
    expect(decide({ payment: { ...APPROVED, transactionAmountCents: 150049 } })).toEqual({
      outcome: 'amount_mismatch',
      confirm: false,
      recordPayment: true,
    });
  });

  it('does not store a payment with a non-positive amount', () => {
    expect(decide({ payment: { ...APPROVED, transactionAmountCents: 0 } })).toEqual({
      outcome: 'amount_mismatch',
      confirm: false,
      recordPayment: false,
    });
  });

  it('records a currency mismatch without storing the payment', () => {
    expect(decide({ payment: { ...APPROVED, currencyId: 'USD' } })).toEqual({
      outcome: 'currency_mismatch',
      confirm: false,
      recordPayment: false,
    });
  });

  it('confirms a sandbox payment that Mercado Pago marks live (test accounts)', () => {
    // Test accounts run in Mercado Pago's production environment, so their payments say live.
    const testAccountPayment = { ...APPROVED, liveMode: true };

    expect(decide({ payment: testAccountPayment })).toEqual({
      outcome: 'confirmed',
      confirm: true,
      recordPayment: true,
    });
  });

  it('reports an unknown registration without storing anything', () => {
    expect(decide({ registration: null })).toEqual({
      outcome: 'unknown_registration',
      confirm: false,
      recordPayment: false,
    });
  });

  it('reports a status outside Mercado Pago vocabulary without storing it', () => {
    expect(decide({ payment: { ...APPROVED, status: 'something_new' } })).toEqual({
      outcome: 'unknown_status',
      confirm: false,
      recordPayment: false,
    });
  });

  it('keeps every outcome within the 64-character database limit', () => {
    const statuses = ['approved', 'pending', 'in_process', 'authorized', 'rejected', 'cancelled'];
    const more = ['refunded', 'charged_back', 'in_mediation', 'something_new'];
    for (const status of [...statuses, ...more])
      expect(decide({ payment: { ...APPROVED, status } }).outcome.length).toBeLessThanOrEqual(64);
  });
});
