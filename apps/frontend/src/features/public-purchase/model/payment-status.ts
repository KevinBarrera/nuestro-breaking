import type { PaymentStatus, PublicEventFailure } from '@/entities/public-event';

// The return page polls the payment status (#178, D7): right away, then every 3 s while the
// answer is `confirming`, at most 20 tries (about 60 s, under the public rate limit). After that,
// or after a network error or a 429, it says the result is taking longer and offers "Revisar de
// nuevo", which restarts the same bounded polling. Any other answer settles the page.
export const paymentPollIntervalMs = 3_000;
export const paymentPollMaxTries = 20;

export type PaymentPoll =
  // `tries` counts the answers of the current round; `status` is the latest answer, kept for the
  // masked email the waiting views mention.
  | { phase: 'confirming'; tries: number; status: PaymentStatus | null }
  | { phase: 'taking-longer'; status: PaymentStatus | null }
  | { phase: 'settled'; status: PaymentStatus }
  | { phase: 'not-found'; status: null };

export type PaymentPollEvent =
  | { type: 'answer'; status: PaymentStatus }
  | { type: 'failure'; failure: PublicEventFailure }
  | { type: 'retry' };

// What the page shows. `unavailable` covers a voided registration and an unknown one alike.
export type PaymentView =
  'confirming' | 'taking-longer' | 'confirmed' | 'pending' | 'rejected' | 'unavailable';

export const startPaymentPoll = (): PaymentPoll => ({
  phase: 'confirming',
  tries: 0,
  status: null,
});

export function paymentPollStep(state: PaymentPoll, event: PaymentPollEvent): PaymentPoll {
  if (event.type === 'retry')
    return state.phase === 'taking-longer'
      ? { phase: 'confirming', tries: 0, status: state.status }
      : state;
  // A late answer after the page settled or gave up is ignored.
  if (state.phase !== 'confirming') return state;
  if (event.type === 'failure') {
    // A 400 means the id on the URL is not a registration id at all.
    if (event.failure.kind === 'not-found' || event.failure.kind === 'invalid')
      return { phase: 'not-found', status: null };
    return { phase: 'taking-longer', status: state.status };
  }
  if (event.status.status !== 'confirming') return { phase: 'settled', status: event.status };
  const tries = state.tries + 1;
  return tries >= paymentPollMaxTries
    ? { phase: 'taking-longer', status: event.status }
    : { phase: 'confirming', tries, status: event.status };
}

// Milliseconds until the next request, or null when the page stops asking.
export function nextPollDelay(state: PaymentPoll): number | null {
  if (state.phase !== 'confirming') return null;
  return state.tries === 0 ? 0 : paymentPollIntervalMs;
}

export function paymentPollView(state: PaymentPoll): PaymentView {
  switch (state.phase) {
    case 'confirming':
    case 'taking-longer':
      return state.phase;
    case 'not-found':
      return 'unavailable';
    case 'settled':
      // A settled answer is never `confirming` (see paymentPollStep).
      return state.status.status === 'confirming' ? 'confirming' : state.status.status;
  }
}
