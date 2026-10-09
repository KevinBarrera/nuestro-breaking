import type { PreferenceRequest } from '@/payments/mercado-pago-client';

export interface CheckoutPreferenceInput {
  registrationId: string;
  slug: string;
  /** The registration's pass snapshots: pass type name and `price_cents`. */
  passes: { name: string; priceCents: number }[];
  publicAppUrl: string;
  notificationUrl: string;
}

/** Integer cents to pesos with cents kept as decimals (150050 → 1500.5). */
export function centsToPesos(cents: number): number {
  return cents / 100;
}

/**
 * The Checkout Pro preference for a pending registration (#177 D8): one MXN item per paid pass,
 * the registration id as `external_reference` and the buyer's result page for every outcome.
 * Free passes are left out because a Mercado Pago item needs a positive price; the total is the
 * same. No payer data is sent.
 */
export function buildPreferenceRequest(input: CheckoutPreferenceInput): PreferenceRequest {
  const returnUrl = `${input.publicAppUrl}/e/${encodeURIComponent(input.slug)}/pago?registration=${encodeURIComponent(input.registrationId)}`;
  return {
    items: input.passes
      .filter((pass) => pass.priceCents > 0)
      .map((pass) => ({
        title: pass.name,
        quantity: 1,
        unit_price: centsToPesos(pass.priceCents),
        currency_id: 'MXN',
      })),
    external_reference: input.registrationId,
    back_urls: { success: returnUrl, failure: returnUrl, pending: returnUrl },
    auto_return: 'approved',
    notification_url: input.notificationUrl,
  };
}
