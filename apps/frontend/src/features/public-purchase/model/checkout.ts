import type { PublicEventFailure } from '@/entities/public-event';
import type { PayFix } from './purchase-review';
import { failureMessage } from './registration-request';

/**
 * The checkout URL only when it is an absolute `https:` URL; anything else is null and treated as
 * a failed checkout. Defense in depth: the browser is sent to whatever this returns.
 */
export function safeCheckoutUrl(value: string): string | null {
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

// What the review screen shows when starting the checkout fails. The registration already
// exists as pending, so `retry` asks for a new checkout only, never a second registration.
export type CheckoutFailure = { message: string; retry: boolean; fix: PayFix | null };

export function checkoutFailure(failure: PublicEventFailure): CheckoutFailure {
  switch (failure.kind) {
    case 'sales-closed':
    case 'not-found':
      return { message: failureMessage(failure), retry: false, fix: 'home' };
    case 'not-payable':
      return { message: failureMessage(failure), retry: false, fix: null };
    case 'error':
      return {
        message: 'No pudimos abrir Mercado Pago. Revisa tu conexión e intenta de nuevo.',
        retry: true,
        fix: null,
      };
    case 'provider-unavailable':
    case 'rate-limited':
      return { message: failureMessage(failure), retry: true, fix: null };
    // Not expected from this endpoint (its only input is the ids in the path).
    case 'invalid':
    case 'rule':
    case 'unavailable':
      return { message: failureMessage(failure), retry: false, fix: null };
  }
}

/**
 * The registration id on the Mercado Pago return URL (`/e/:slug/pago?registration=<id>`, D8).
 * Mercado Pago's own params (`status`, `collection_status`, `payment_id`, ...) are deliberately
 * not read: anyone can type them, and only the verified webhook confirms a payment.
 */
export function paymentReturnRegistration(params: URLSearchParams): string | null {
  return params.get('registration')?.trim() || null;
}
