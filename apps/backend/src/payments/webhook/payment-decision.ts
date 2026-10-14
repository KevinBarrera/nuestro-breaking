import type { LateApprovalContext } from '@/events/registration-expiry';
import type { ProviderPayment } from '@/payments/mercado-pago-client';

export interface PaymentDecisionInput {
  payment: Pick<ProviderPayment, 'status' | 'transactionAmountCents' | 'currencyId'>;
  /** Null when `external_reference` names no registration with a checkout in this mode. */
  registration: {
    status: string;
    /** Sum of the registration's pass price snapshots. */
    expectedAmountCents: number;
    /** True when a `payment_approval` fact for this very payment already confirmed it. */
    confirmedByThisPayment: boolean;
    /** Set for a registration voided because its payment window expired (#181 S4). */
    expiry?: LateApprovalContext | null;
  } | null;
}

export interface PaymentDecision {
  /** Short code stored on the notification (at most 64 characters). */
  outcome: string;
  /** Confirm the registration with `approved_payment` (a pending one, or an expired one). */
  confirm: boolean;
  /** Upsert the `registration_payments` row (only values its checks accept). */
  recordPayment: boolean;
}

// Mercado Pago's payment statuses, as allowed by `registration_payments_status_ck`.
const KNOWN_STATUSES = new Set([
  'pending',
  'approved',
  'authorized',
  'in_process',
  'in_mediation',
  'rejected',
  'cancelled',
  'refunded',
  'charged_back',
]);

/**
 * Maps a re-read Mercado Pago payment and its registration to what the webhook does (#177 D11).
 * Only `approved`, in full and in MXN confirms a pending registration; every other status is
 * recorded and a confirmation is never undone.
 *
 * Late approval rule (#181 S4): an approval for a registration voided because its payment window
 * expired confirms it when the event has not ended and the same person holds no other pending or
 * confirmed registration in the event. Otherwise the payment is recorded and the outcome flags it
 * for coordination's manual review; nothing is refunded automatically. A registration voided for
 * any other reason stays voided (`approved_after_void`).
 *
 * There is no `live_mode` check: Mercado Pago test accounts operate in its production environment,
 * so sandbox payments say live too. Mode separation is enforced by credentials instead: the
 * configured access token can only read payments of its own account, and the checkout row's `mode`
 * records which credential set created it (the registration lookup requires a checkout in this
 * mode).
 */
export function decidePayment({ payment, registration }: PaymentDecisionInput): PaymentDecision {
  if (!registration)
    return { outcome: 'unknown_registration', confirm: false, recordPayment: false };
  if (!KNOWN_STATUSES.has(payment.status))
    return { outcome: 'unknown_status', confirm: false, recordPayment: false };
  if (payment.currencyId !== 'MXN')
    return { outcome: 'currency_mismatch', confirm: false, recordPayment: false };
  const recordPayment = payment.transactionAmountCents > 0;
  const record = (outcome: string) => ({ outcome, confirm: false, recordPayment });
  if (payment.transactionAmountCents !== registration.expectedAmountCents)
    return record('amount_mismatch');
  if (payment.status !== 'approved') return record(`payment_${payment.status}`);
  if (registration.status === 'pending_payment')
    return { outcome: 'confirmed', confirm: true, recordPayment };
  if (registration.status === 'confirmed')
    return record(
      registration.confirmedByThisPayment ? 'already_confirmed' : 'approved_after_confirmation',
    );
  const expiry = registration.expiry;
  if (!expiry) return record('approved_after_void');
  if (expiry.eventEnded) return record('approved_after_expiry_event_ended');
  if (expiry.otherActiveRegistration) return record('approved_after_expiry_duplicate');
  return { outcome: 'confirmed_after_expiry', confirm: true, recordPayment };
}
