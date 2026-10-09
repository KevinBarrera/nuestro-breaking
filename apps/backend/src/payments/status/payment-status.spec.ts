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

  // Offering a retry while another payment is still on its way could charge the buyer twice.
  it('stays pending while any payment is on its way, even if a later update failed another one', () => {
    expect(decidePaymentStatus('pending_payment', ['in_process', 'cancelled'])).toBe('pending');
    expect(decidePaymentStatus('pending_payment', ['rejected', 'pending'])).toBe('pending');
  });

  it('reports rejected only when every payment failed', () => {
    expect(decidePaymentStatus('pending_payment', ['rejected', 'cancelled'])).toBe('rejected');
  });

  it('keeps confirming while no payment is known yet', () => {
    expect(decidePaymentStatus('pending_payment', [])).toBe('confirming');
  });

  // An approval is only final once the webhook confirms the registration.
  it.each(['approved', 'in_mediation', 'refunded', 'charged_back', 'something_new'])(
    'keeps confirming when a payment is %s, even next to a failed one',
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
