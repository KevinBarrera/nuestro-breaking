/** The result the return page shows after Mercado Pago sends the buyer back (#178 D4). */
export type PublicPaymentStatus =
  'confirming' | 'confirmed' | 'pending' | 'rejected' | 'unavailable';

export type PublicPaymentStatusPass = {
  name: string;
  /** Names of the competitions selected for this pass. */
  competitions: string[];
};

/**
 * `GET /public/events/:slug/registrations/:registrationId/payment-status`. Only what the return
 * page needs: no full email, phone, ids or payment provider data.
 */
export type PublicPaymentStatusResponse = {
  status: PublicPaymentStatus;
  firstName: string;
  /** `a***@gmail.com`; null when the participant has no email (admin manual registrations). */
  maskedEmail: string | null;
  /** Set only when `status` is `confirmed`. */
  folio: string | null;
  passes: PublicPaymentStatusPass[];
  totalCents: number;
};
