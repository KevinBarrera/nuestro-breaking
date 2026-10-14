import type { Environment } from '@/http';

/** How long an online buyer has to pay a pending registration (#181 S1). */
export interface PendingPaymentWindow {
  /** Hours Mercado Pago keeps an offline payment (OXXO, SPEI) payable after each checkout. */
  paymentHours: number;
}

/** Injection token for the window, read once at startup by the modules that use it. */
export const PENDING_PAYMENT_WINDOW = Symbol('PENDING_PAYMENT_WINDOW');

// Mercado Pago recommends at least 3 days for offline payments, because crediting can take up
// to 2 business hours.
const DEFAULT_PAYMENT_HOURS = 72;
const MIN_PAYMENT_HOURS = 1;
const MAX_PAYMENT_HOURS = 720;
// A registration outlives its payment window by one day, so a voucher paid at the last minute is
// credited and notified before the registration expires.
const GRACE_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;

export function readPendingPaymentWindow(env: Environment): PendingPaymentWindow {
  const value = env.PENDING_PAYMENT_HOURS?.trim();
  if (!value) return { paymentHours: DEFAULT_PAYMENT_HOURS };
  const hours = /^\d+$/.test(value) ? Number(value) : NaN;
  if (hours >= MIN_PAYMENT_HOURS && hours <= MAX_PAYMENT_HOURS) return { paymentHours: hours };
  throw new Error(
    `PENDING_PAYMENT_HOURS must be a whole number of hours from ${MIN_PAYMENT_HOURS} to ${MAX_PAYMENT_HOURS}.`,
  );
}

/**
 * Deadlines for a payment attempt that starts at `now`: Mercado Pago stops accepting the payment
 * at `paymentDueAt`, and the pending registration expires at `expiresAt`.
 */
export function paymentDeadlines(
  window: PendingPaymentWindow,
  now: Date,
): { paymentDueAt: Date; expiresAt: Date } {
  const paymentDueAt = new Date(now.getTime() + window.paymentHours * HOUR_MS);
  return { paymentDueAt, expiresAt: new Date(paymentDueAt.getTime() + GRACE_HOURS * HOUR_MS) };
}
