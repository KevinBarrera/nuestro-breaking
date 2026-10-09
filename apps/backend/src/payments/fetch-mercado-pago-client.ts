import { randomUUID } from 'node:crypto';
import type { MercadoPagoConfig } from './mercado-pago-config';
import {
  MercadoPagoClient,
  MercadoPagoClientError,
  type CreatedPreference,
  type PreferenceRequest,
  type ProviderPayment,
} from './mercado-pago-client';

const PREFERENCES_URL = 'https://api.mercadopago.com/checkout/preferences';
const PAYMENTS_URL = 'https://api.mercadopago.com/v1/payments';
const DEFAULT_TIMEOUT_MS = 10_000;
const SAFE_REASON = /^[A-Za-z _.,:'()-]+$/;

/**
 * `MercadoPagoClient` over Node's global `fetch` (D2). Errors carry only a status code, a fixed
 * message or a filtered short rejection reason: never the access token, the provider's body or
 * the underlying network error.
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
      const reason = response.status === 400 ? await this.rejectionReason(response) : null;
      throw new MercadoPagoClientError(
        reason
          ? `Mercado Pago preference request failed with status 400: ${reason}`
          : `Mercado Pago preference request failed with status ${response.status}.`,
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

  /**
   * Mercado Pago's short reason for a rejected preference (for example an invalid `auto_return`),
   * so operators can see which field was refused. Only plain words pass: a reason with digits,
   * `@`, `/` or the access token, or longer than 160 characters, is dropped.
   */
  private async rejectionReason(response: Response): Promise<string | null> {
    const message = stringField(await response.json().catch(() => null), 'message')?.trim();
    if (!message || message.length > 160 || message.includes(this.config.accessToken)) return null;
    return SAFE_REASON.test(message) ? message : null;
  }

  /** Reads a payment by id (#177 D11), so the webhook always acts on its current state. */
  async getPayment(paymentId: string): Promise<ProviderPayment> {
    let response: Response;
    try {
      response = await this.fetchFn(`${PAYMENTS_URL}/${encodeURIComponent(paymentId)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.config.accessToken}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new MercadoPagoClientError('Mercado Pago payment request failed before a response.');
    }
    if (!response.ok) {
      throw new MercadoPagoClientError(
        `Mercado Pago payment request failed with status ${response.status}.`,
        response.status,
      );
    }
    const body: unknown = await response.json().catch(() => null);
    const payment = readPayment(body);
    if (!payment || payment.id !== paymentId) {
      throw new MercadoPagoClientError('Mercado Pago payment response was malformed.');
    }
    return payment;
  }
}

function readPayment(body: unknown): ProviderPayment | null {
  if (typeof body !== 'object' || body === null) return null;
  const fields = body as Record<string, unknown>;
  const id = typeof fields.id === 'number' ? String(fields.id) : stringField(body, 'id');
  const status = stringField(body, 'status');
  const currencyId = stringField(body, 'currency_id');
  const amount = fields.transaction_amount;
  const reference = fields.external_reference ?? null;
  if (!id || !status || !currencyId) return null;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return null;
  if (reference !== null && typeof reference !== 'string') return null;
  return {
    id,
    status,
    // Pesos with up to two decimals; rounding absorbs binary float error (19.99 * 100).
    transactionAmountCents: Math.round(amount * 100),
    currencyId,
    externalReference: reference || null,
  };
}

function stringField(body: unknown, name: string): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const value = (body as Record<string, unknown>)[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
