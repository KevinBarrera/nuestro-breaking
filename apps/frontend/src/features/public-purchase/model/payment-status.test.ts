import type { PaymentStatus, PaymentStatusValue } from '@/entities/public-event';
import { describe, expect, it } from 'vitest';
import {
  nextPollDelay,
  paymentPollIntervalMs,
  paymentPollMaxTries,
  paymentPollStep,
  paymentPollView,
  startPaymentPoll,
  type PaymentPoll,
} from './payment-status';

const answer = (status: PaymentStatusValue): PaymentStatus => ({
  status,
  firstName: 'Ana',
  maskedEmail: 'a***@gmail.com',
  folio: status === 'confirmed' ? 'LMP-2345' : null,
  passes: [{ name: 'Open Styles', competitions: [] }],
  totalCents: 80000,
});

// Feeds `count` "still confirming" answers into the poll.
function confirmingAnswers(state: PaymentPoll, count: number): PaymentPoll {
  let next = state;
  for (let index = 0; index < count; index += 1)
    next = paymentPollStep(next, { type: 'answer', status: answer('confirming') });
  return next;
}

describe('payment status polling', () => {
  it('asks right away, then every 3 seconds while the payment is confirming', () => {
    const start = startPaymentPoll();
    expect(paymentPollView(start)).toBe('confirming');
    expect(nextPollDelay(start)).toBe(0);

    const next = confirmingAnswers(start, 1);
    expect(paymentPollView(next)).toBe('confirming');
    expect(nextPollDelay(next)).toBe(paymentPollIntervalMs);
    expect(paymentPollIntervalMs).toBe(3_000);
  });

  it('keeps the latest answer so the page can show the masked email', () => {
    const next = confirmingAnswers(startPaymentPoll(), 1);
    expect(next.status?.maskedEmail).toBe('a***@gmail.com');
  });

  it('stops after 20 tries and says it is taking longer', () => {
    expect(paymentPollMaxTries).toBe(20);
    const almost = confirmingAnswers(startPaymentPoll(), paymentPollMaxTries - 1);
    expect(paymentPollView(almost)).toBe('confirming');
    expect(nextPollDelay(almost)).toBe(paymentPollIntervalMs);

    const done = confirmingAnswers(almost, 1);
    expect(paymentPollView(done)).toBe('taking-longer');
    expect(nextPollDelay(done)).toBeNull();
  });

  it.each(['confirmed', 'pending', 'rejected', 'unavailable'] as const)(
    'stops on a %s answer and shows it',
    (status) => {
      const next = paymentPollStep(confirmingAnswers(startPaymentPoll(), 3), {
        type: 'answer',
        status: answer(status),
      });
      expect(paymentPollView(next)).toBe(status);
      expect(nextPollDelay(next)).toBeNull();
      expect(next.status?.status).toBe(status);
    },
  );

  it('shows the neutral unavailable view for an unknown or malformed registration', () => {
    for (const failure of [{ kind: 'not-found' }, { kind: 'invalid', fieldErrors: {} }] as const) {
      const next = paymentPollStep(startPaymentPoll(), { type: 'failure', failure });
      expect(paymentPollView(next), failure.kind).toBe('unavailable');
      expect(nextPollDelay(next)).toBeNull();
    }
  });

  it('says it is taking longer after a network error or a rate limit', () => {
    for (const failure of [{ kind: 'error' }, { kind: 'rate-limited' }] as const) {
      const next = paymentPollStep(confirmingAnswers(startPaymentPoll(), 2), {
        type: 'failure',
        failure,
      });
      expect(paymentPollView(next), failure.kind).toBe('taking-longer');
      expect(nextPollDelay(next)).toBeNull();
    }
  });

  it('restarts the bounded polling when the buyer checks again', () => {
    const tired = confirmingAnswers(startPaymentPoll(), paymentPollMaxTries);
    const again = paymentPollStep(tired, { type: 'retry' });
    expect(paymentPollView(again)).toBe('confirming');
    expect(nextPollDelay(again)).toBe(0);
    expect(again.status?.maskedEmail).toBe('a***@gmail.com');

    expect(paymentPollView(confirmingAnswers(again, paymentPollMaxTries - 1))).toBe('confirming');
    expect(paymentPollView(confirmingAnswers(again, paymentPollMaxTries))).toBe('taking-longer');
  });

  it('ignores a retry or a late answer once the poll has settled', () => {
    const confirmed = paymentPollStep(startPaymentPoll(), {
      type: 'answer',
      status: answer('confirmed'),
    });
    expect(paymentPollStep(confirmed, { type: 'retry' })).toBe(confirmed);
    expect(paymentPollStep(confirmed, { type: 'answer', status: answer('rejected') })).toBe(
      confirmed,
    );
    expect(paymentPollStep(confirmed, { type: 'failure', failure: { kind: 'error' } })).toBe(
      confirmed,
    );
  });

  it('ignores a retry while it is still polling', () => {
    const polling = confirmingAnswers(startPaymentPoll(), 3);
    expect(paymentPollStep(polling, { type: 'retry' })).toBe(polling);
  });
});
