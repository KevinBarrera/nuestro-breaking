import { paymentDeadlines, readPendingPaymentWindow } from './pending-payment-window';

const HOUR = 60 * 60 * 1000;

describe('readPendingPaymentWindow', () => {
  it('defaults to 72 hours, the minimum Mercado Pago recommends for offline payments', () => {
    expect(readPendingPaymentWindow({})).toEqual({ paymentHours: 72 });
    expect(readPendingPaymentWindow({ PENDING_PAYMENT_HOURS: '  ' })).toEqual({ paymentHours: 72 });
  });

  it('reads a whole number of hours from 1 to 720', () => {
    expect(readPendingPaymentWindow({ PENDING_PAYMENT_HOURS: '1' })).toEqual({ paymentHours: 1 });
    expect(readPendingPaymentWindow({ PENDING_PAYMENT_HOURS: ' 720 ' })).toEqual({
      paymentHours: 720,
    });
  });

  it.each(['0', '721', '1.5', '-3', 'abc', '24h'])('rejects %p', (value) => {
    expect(() => readPendingPaymentWindow({ PENDING_PAYMENT_HOURS: value })).toThrow(
      'PENDING_PAYMENT_HOURS must be a whole number of hours from 1 to 720.',
    );
  });
});

describe('paymentDeadlines', () => {
  it('ends the payment window after the configured hours and the registration one day later', () => {
    const now = new Date('2026-11-01T10:00:00.000Z');

    expect(paymentDeadlines({ paymentHours: 72 }, now)).toEqual({
      paymentDueAt: new Date(now.getTime() + 72 * HOUR),
      expiresAt: new Date(now.getTime() + 96 * HOUR),
    });
  });
});
