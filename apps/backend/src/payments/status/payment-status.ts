import type { PublicPaymentStatus } from './public-payment-status.types';

// Mercado Pago statuses of a payment that is still on its way (OXXO, SPEI, a card under review).
const WAITING = new Set(['pending', 'in_process', 'authorized']);
// Mercado Pago statuses after which the buyer has to try again.
const FAILED = new Set(['rejected', 'cancelled']);

/**
 * What the return page shows (#178 D4), from every payment of the registration in any order.
 * `confirmed` comes only from the registration status the verified webhook sets; an `approved`
 * payment alone keeps the page confirming until it does. A payment still on its way wins over a
 * failed one, and `rejected` needs every payment to have failed, because the rejected screen
 * offers a retry and a retry next to a payment in flight could charge the buyer twice.
 */
export function decidePaymentStatus(
  registrationStatus: string,
  paymentStatuses: readonly string[],
): PublicPaymentStatus {
  if (registrationStatus === 'confirmed') return 'confirmed';
  if (registrationStatus !== 'pending_payment') return 'unavailable';
  if (paymentStatuses.some((status) => WAITING.has(status))) return 'pending';
  if (paymentStatuses.length > 0 && paymentStatuses.every((status) => FAILED.has(status))) {
    return 'rejected';
  }
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
