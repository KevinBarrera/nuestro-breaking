/** One Checkout Pro line item; `unit_price` is in pesos, with cents as decimals. */
export interface PreferenceItem {
  title: string;
  quantity: number;
  unit_price: number;
  currency_id: 'MXN';
}

/** The Checkout Pro preference body (#177 D8). It never carries payer data. */
export interface PreferenceRequest {
  items: PreferenceItem[];
  external_reference: string;
  back_urls: { success: string; failure: string; pending: string };
  auto_return: 'approved';
  notification_url: string;
}

export interface CreatedPreference {
  preferenceId: string;
  /** Hosted Checkout Pro page for the configured mode (sandbox or production). */
  checkoutUrl: string;
}

/** Thrown by a client for any provider failure. Its message never holds a token or a body. */
export class MercadoPagoClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MercadoPagoClientError';
  }
}

/** Mercado Pago REST calls used by the app (D2). Also the injection token, so e2e can stub it. */
export abstract class MercadoPagoClient {
  abstract createPreference(input: PreferenceRequest): Promise<CreatedPreference>;
}
