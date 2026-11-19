import type { PreferenceRequest } from '@/payments/mercado-pago-client';

export interface CheckoutPreferenceInput {
  registrationId: string;
  slug: string;
  /** The registration's pass snapshots: pass type name and `price_cents`. */
  passes: { name: string; priceCents: number }[];
  /** Online service charge for these passes (#239); 0 adds no item. */
  serviceChargeCents: number;
  publicAppUrl: string;
  notificationUrl: string;
  /** End of the offline payment window (#181 S1). */
  paymentDueAt: Date;
}

// Buyer-facing name of the charge line on the Mercado Pago checkout.
const SERVICE_CHARGE_TITLE = 'Cargo por servicio';

/** Integer cents to pesos with cents kept as decimals (150050 → 1500.5). */
export function centsToPesos(cents: number): number {
  return cents / 100;
}

/**
 * The Checkout Pro preference for a pending registration (#177 D8): one MXN item per paid pass,
 * the registration id as `external_reference` and the buyer's result page for every outcome,
 * returning automatically after approval when the buyer site is https, and the end of the offline
 * payment window (#181 S1).
 * The service charge, when there is one, is the last item, so Mercado Pago charges the passes plus
 * the charge (#239). Free passes are left out because a Mercado Pago item needs a positive price;
 * the total is the same. No payer data is sent.
 */
export function buildPreferenceRequest(input: CheckoutPreferenceInput): PreferenceRequest {
  const returnUrl = `${input.publicAppUrl}/e/${encodeURIComponent(input.slug)}/pago?registration=${encodeURIComponent(input.registrationId)}`;
  return {
    items: [
      ...input.passes.map((pass) => ({ title: pass.name, priceCents: pass.priceCents })),
      { title: SERVICE_CHARGE_TITLE, priceCents: input.serviceChargeCents },
    ]
      .filter((item) => item.priceCents > 0)
      .map((item) => ({
        title: item.title,
        quantity: 1,
        unit_price: centsToPesos(item.priceCents),
        currency_id: 'MXN',
      })),
    external_reference: input.registrationId,
    back_urls: { success: returnUrl, failure: returnUrl, pending: returnUrl },
    // Mercado Pago refuses auto_return toward a non-https site (local sandbox on localhost); there
    // the buyer returns with the "Volver al sitio" button instead.
    ...(input.publicAppUrl.startsWith('https://') ? { auto_return: 'approved' as const } : {}),
    notification_url: input.notificationUrl,
    // Mercado Pago's documented example carries an explicit offset, so UTC is sent as +00:00.
    date_of_expiration: input.paymentDueAt.toISOString().replace(/Z$/, '+00:00'),
  };
}
