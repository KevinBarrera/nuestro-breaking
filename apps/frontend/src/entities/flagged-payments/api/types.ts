// Mercado Pago payments the backend recorded but could not settle on its own (#230). See
// docs/contracts/flagged-payments.md.
export const flaggedPaymentReasons = [
  'approved_after_expiry_duplicate',
  'approved_after_expiry_event_ended',
  'approved_after_confirmation',
  'approved_after_void',
] as const;

export type FlaggedPaymentReason = (typeof flaggedPaymentReasons)[number];

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

export type FlaggedPaymentsFailure = 'denied' | 'not-found' | 'error';
