import { randomUUID } from 'node:crypto';
import type { MercadoPagoConfig } from './mercado-pago-config';
import {
  MercadoPagoClient,
  MercadoPagoClientError,
  type CreatedPreference,
  type PreferenceRequest,
} from './mercado-pago-client';

const PREFERENCES_URL = 'https://api.mercadopago.com/checkout/preferences';
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * `MercadoPagoClient` over Node's global `fetch` (D2). Errors carry only a status code or a fixed
 * message: never the access token, the provider's body or the underlying network error.
 */
export class FetchMercadoPagoClient extends MercadoPagoClient {
  constructor(
    private readonly config: MercadoPagoConfig,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    super();
  }

  async createPreference(input: PreferenceRequest): Promise<CreatedPreference> {
    let response: Response;
    try {
      response = await this.fetchFn(PREFERENCES_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
          // A fresh key per call: each checkout request is a new preference (D8).
          'X-Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new MercadoPagoClientError('Mercado Pago preference request failed before a response.');
    }
    if (!response.ok) {
      throw new MercadoPagoClientError(
        `Mercado Pago preference request failed with status ${response.status}.`,
      );
    }

    const body: unknown = await response.json().catch(() => null);
    const urlField = this.config.mode === 'production' ? 'init_point' : 'sandbox_init_point';
    const preferenceId = stringField(body, 'id');
    const checkoutUrl = stringField(body, urlField);
    if (!preferenceId || !checkoutUrl?.startsWith('https://')) {
      throw new MercadoPagoClientError('Mercado Pago preference response was malformed.');
    }
    return { preferenceId, checkoutUrl };
  }
}

function stringField(body: unknown, name: string): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const value = (body as Record<string, unknown>)[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
