import { checkSendable, retryDelaySeconds } from './confirmation-email-policy';

describe('retryDelaySeconds', () => {
  it.each([
    [1, 60],
    [2, 120],
    [3, 240],
    [6, 1_920],
    [7, 3_600],
    [8, 3_600],
    [50, 3_600],
  ])('waits the right time after attempt %i', (attempts, seconds) => {
    expect(retryDelaySeconds(attempts)).toBe(seconds);
  });
});

describe('checkSendable', () => {
  const ready = { status: 'confirmed', folio: 'LMP-AB12', email: ' ana@example.test ' };

  it('accepts a confirmed registration with a folio and an address', () => {
    expect(checkSendable(ready)).toEqual({ sendable: { ...ready, email: 'ana@example.test' } });
  });

  it('names each reason an email cannot be sent', () => {
    expect(checkSendable(undefined)).toEqual({ reason: 'registration_missing' });
    expect(checkSendable({ ...ready, status: 'pending_payment' })).toEqual({
      reason: 'not_confirmed',
    });
    expect(checkSendable({ ...ready, folio: null })).toEqual({ reason: 'missing_folio' });
    expect(checkSendable({ ...ready, email: null })).toEqual({ reason: 'missing_recipient' });
    expect(checkSendable({ ...ready, email: '  ' })).toEqual({ reason: 'missing_recipient' });
  });
});
