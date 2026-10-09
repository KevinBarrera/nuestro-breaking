import type { PublicPaymentStatus } from './public-payment-status.types';

// Mercado Pago statuses of a payment that is still on its way (OXXO, SPEI, a card under review).
const WAITING = new Set(['pending', 'in_process', 'authorized']);
// Mercado Pago statuses after which the buyer has to try again.
const FAILED = new Set(['rejected', 'cancelled']);

/**
 * What the return page shows (#178 D4), from every payment of the registration ordered by when it
 * was created, oldest first. `confirmed` comes only from the registration status the verified
 * webhook sets; any `approved` payment keeps the page confirming until it does. Otherwise the newest
 * attempt decides: an older voucher that expires later cannot hide a newer payment in flight, and an
 * older voucher left unpaid cannot block a retry after a newer attempt failed.
 */
export function decidePaymentStatus(
  registrationStatus: string,
  paymentStatusesOldestFirst: readonly string[],
): PublicPaymentStatus {
  if (registrationStatus === 'confirmed') return 'confirmed';
  if (registrationStatus !== 'pending_payment') return 'unavailable';
  if (paymentStatusesOldestFirst.includes('approved')) return 'confirming';
  const newest = paymentStatusesOldestFirst.at(-1);
  if (newest !== undefined && WAITING.has(newest)) return 'pending';
  if (newest !== undefined && FAILED.has(newest)) return 'rejected';
  return 'confirming';
}

/**
 * Masks an email for a page anyone with the return link can open (#178 D1): the first character of
 * the local part and the whole domain, as in `a***@gmail.com`. Missing or malformed emails are null.
 */
export function maskEmail(email: string | null): string | null {
  if (email === null) return null;
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;
  return `${email[0]}***${email.slice(at)}`;
}
