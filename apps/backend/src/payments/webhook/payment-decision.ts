import type { ProviderPayment } from '@/payments/mercado-pago-client';
import type { MercadoPagoMode } from '@/payments/mercado-pago-config';

export interface PaymentDecisionInput {
  payment: Pick<ProviderPayment, 'status' | 'transactionAmountCents' | 'currencyId' | 'liveMode'>;
  mode: MercadoPagoMode;
  /** Null when `external_reference` names no registration with a checkout in this mode. */
  registration: {
    status: string;
    /** Sum of the registration's pass price snapshots. */
    expectedAmountCents: number;
    /** True when a `payment_approval` fact for this very payment already confirmed it. */
    confirmedByThisPayment: boolean;
  } | null;
}

export interface PaymentDecision {
  /** Short code stored on the notification (at most 64 characters). */
  outcome: string;
  /** Confirm the pending registration with `approved_payment`. */
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
 * Only `approved`, in full, in MXN and in the configured mode confirms a pending registration;
 * every other status is recorded and a confirmation is never undone.
 */
export function decidePayment({
  payment,
  mode,
  registration,
}: PaymentDecisionInput): PaymentDecision {
  if (!registration)
    return { outcome: 'unknown_registration', confirm: false, recordPayment: false };
  if (!KNOWN_STATUSES.has(payment.status))
    return { outcome: 'unknown_status', confirm: false, recordPayment: false };
  if (payment.currencyId !== 'MXN')
    return { outcome: 'currency_mismatch', confirm: false, recordPayment: false };
  const recordPayment = payment.transactionAmountCents > 0;
  const record = (outcome: string) => ({ outcome, confirm: false, recordPayment });
  if (payment.liveMode !== (mode === 'production')) return record('mode_mismatch');
  if (payment.transactionAmountCents !== registration.expectedAmountCents)
    return record('amount_mismatch');
  if (payment.status !== 'approved') return record(`payment_${payment.status}`);
  if (registration.status === 'pending_payment')
    return { outcome: 'confirmed', confirm: true, recordPayment };
  if (registration.status === 'confirmed')
    return record(
      registration.confirmedByThisPayment ? 'already_confirmed' : 'approved_after_confirmation',
    );
  return record('approved_after_void');
}
