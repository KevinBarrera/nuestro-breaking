import { decidePaymentStatus, maskEmail } from './payment-status';

describe('decidePaymentStatus', () => {
  it('reports a confirmed registration as confirmed whatever its payments say', () => {
    expect(decidePaymentStatus('confirmed', [])).toBe('confirmed');
    expect(decidePaymentStatus('confirmed', ['rejected'])).toBe('confirmed');
  });

  it('reports a voided registration as unavailable', () => {
    expect(decidePaymentStatus('voided', [])).toBe('unavailable');
    expect(decidePaymentStatus('voided', ['approved'])).toBe('unavailable');
  });

  it.each(['pending', 'in_process', 'authorized'])(
    'reports a pending registration with a %s payment as pending',
    (payment) => {
      expect(decidePaymentStatus('pending_payment', [payment])).toBe('pending');
    },
  );

  it.each(['rejected', 'cancelled'])(
    'reports a pending registration whose only payment is %s as rejected',
    (payment) => {
      expect(decidePaymentStatus('pending_payment', [payment])).toBe('rejected');
    },
  );

  // Statuses are ordered by when each payment was created, oldest first.
  it('follows the newest payment attempt, not the most recently updated one', () => {
    // An old OXXO voucher that expires later must not hide a newer card payment in flight.
    expect(decidePaymentStatus('pending_payment', ['cancelled', 'in_process'])).toBe('pending');
    // An old unpaid voucher must not block a retry after a newer card was rejected.
    expect(decidePaymentStatus('pending_payment', ['pending', 'rejected'])).toBe('rejected');
  });

  it('keeps confirming when any payment was approved, whatever came after it', () => {
    expect(decidePaymentStatus('pending_payment', ['approved', 'pending'])).toBe('confirming');
    expect(decidePaymentStatus('pending_payment', ['approved', 'rejected'])).toBe('confirming');
  });

  it('keeps confirming while no payment is known yet', () => {
    expect(decidePaymentStatus('pending_payment', [])).toBe('confirming');
  });

  // An approval is only final once the webhook confirms the registration.
  it.each(['approved', 'in_mediation', 'refunded', 'charged_back', 'something_new'])(
    'keeps confirming when the newest payment is %s',
    (payment) => {
      expect(decidePaymentStatus('pending_payment', [payment])).toBe('confirming');
      expect(decidePaymentStatus('pending_payment', ['rejected', payment])).toBe('confirming');
    },
  );

  it('treats an unknown registration status as unavailable', () => {
    expect(decidePaymentStatus('archived', ['rejected'])).toBe('unavailable');
  });
});

describe('maskEmail', () => {
  it('keeps the first character of the local part and the whole domain', () => {
    expect(maskEmail('ana.lopez@gmail.com')).toBe('a***@gmail.com');
  });

  it('masks a one-character local part too', () => {
    expect(maskEmail('a@example.com')).toBe('a***@example.com');
  });

  it('splits on the last @', () => {
    expect(maskEmail('"odd@name"@example.com')).toBe('"***@example.com');
  });

  it('returns null for a missing or malformed email', () => {
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail('no-at-sign')).toBeNull();
    expect(maskEmail('@example.com')).toBeNull();
    expect(maskEmail('ana@')).toBeNull();
  });
});
