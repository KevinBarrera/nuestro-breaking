/**
 * Outcomes of a recorded Mercado Pago payment that the system could not settle on its own (#181
 * late approval rule, #177 D11). Coordination reviews them by hand; nothing is refunded here.
 */
export const FLAGGED_PAYMENT_REASONS = [
  'approved_after_expiry_duplicate',
  'approved_after_expiry_event_ended',
  'approved_after_confirmation',
  'approved_after_void',
] as const;

/**
 * Outcomes written when Mercado Pago refused to return the payment. They say nothing about the
 * payment itself, so they never replace an earlier outcome.
 */
export const UNREAD_PAYMENT_OUTCOMES = ['payment_not_found', 'payment_unreadable'] as const;

export type FlaggedPaymentReason = (typeof FLAGGED_PAYMENT_REASONS)[number];

/** One Mercado Pago payment whose latest outcome is flagged. No payer data from Mercado Pago. */
export type FlaggedPayment = {
  providerPaymentId: string;
  reason: FlaggedPaymentReason;
  receivedAt: string;
  amountCents: number;
  registration: {
    id: string;
    folio: string | null;
    participantName: string;
    status: string;
  };
};

export type FlaggedPayments = { payments: FlaggedPayment[] };
