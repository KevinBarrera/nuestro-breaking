import type { MercadoPagoConfig } from './mercado-pago-config';
import { FetchMercadoPagoClient } from './fetch-mercado-pago-client';
import { MercadoPagoClientError, type PreferenceRequest } from './mercado-pago-client';

const TOKEN = 'TEST-fake-token-should-not-leak';
const CONFIG: MercadoPagoConfig = {
  mode: 'sandbox',
  accessToken: TOKEN,
  webhookSecret: 'fake-webhook-secret',
  publicAppUrl: 'https://example.test',
  notificationUrl: 'https://api.example.test/webhook',
};
const PREFERENCE: PreferenceRequest = {
  items: [{ title: 'Pase completo', quantity: 1, unit_price: 1500.5, currency_id: 'MXN' }],
  external_reference: 'registration-1',
  back_urls: {
    success: 'https://example.test/e/slug/pago?registration=registration-1',
    failure: 'https://example.test/e/slug/pago?registration=registration-1',
    pending: 'https://example.test/e/slug/pago?registration=registration-1',
  },
  auto_return: 'approved',
  notification_url: 'https://api.example.test/webhook',
};
const PROVIDER_BODY = {
  id: 'pref-fake-1',
  init_point: 'https://example.test/checkout/production',
  sandbox_init_point: 'https://example.test/checkout/sandbox',
};

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function clientWith(response: Response | Error, config: MercadoPagoConfig = CONFIG) {
  const fetchFn = jest.fn<Promise<Response>, Parameters<typeof fetch>>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  return { client: new FetchMercadoPagoClient(config, fetchFn), fetchFn };
}

async function failureOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected the call to fail');
}

describe('FetchMercadoPagoClient', () => {
  it('posts the preference with the bearer token, JSON body, idempotency key and a timeout', async () => {
    const { client, fetchFn } = clientWith(jsonResponse(201, PROVIDER_BODY));

    await client.createPreference(PREFERENCE);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/checkout/preferences');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(init?.body as string)).toEqual(PREFERENCE);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('uses a fresh idempotency key on every call', async () => {
    const fetchFn = jest.fn(() => Promise.resolve(jsonResponse(201, PROVIDER_BODY)));
    const client = new FetchMercadoPagoClient(CONFIG, fetchFn);

    await client.createPreference(PREFERENCE);
    await client.createPreference(PREFERENCE);

    const keys = (fetchFn.mock.calls as unknown as [string, RequestInit][]).map(
      ([, init]) => (init.headers as Record<string, string>)['X-Idempotency-Key'],
    );
    expect(new Set(keys).size).toBe(2);
  });

  it('returns the sandbox checkout URL in sandbox mode', async () => {
    const { client } = clientWith(jsonResponse(201, PROVIDER_BODY));

    await expect(client.createPreference(PREFERENCE)).resolves.toEqual({
      preferenceId: 'pref-fake-1',
      checkoutUrl: 'https://example.test/checkout/sandbox',
    });
  });

  it('returns the production checkout URL in production mode', async () => {
    const { client } = clientWith(jsonResponse(201, PROVIDER_BODY), {
      ...CONFIG,
      mode: 'production',
      accessToken: 'APP_USR-fake-token',
    });

    await expect(client.createPreference(PREFERENCE)).resolves.toEqual({
      preferenceId: 'pref-fake-1',
      checkoutUrl: 'https://example.test/checkout/production',
    });
  });

  it('reports only the status code for a non-2xx answer', async () => {
    const { client } = clientWith(
      jsonResponse(401, { message: `invalid token ${TOKEN}`, payer: 'should-not-leak' }),
    );

    const error = await failureOf(client.createPreference(PREFERENCE));

    expect(error).toBeInstanceOf(MercadoPagoClientError);
    expect(error.message).toBe('Mercado Pago preference request failed with status 401.');
  });

  it.each([
    ['a non-JSON body', new Response('not json should-not-leak', { status: 201 })],
    ['a missing id', jsonResponse(201, { ...PROVIDER_BODY, id: undefined })],
    ['a missing checkout URL', jsonResponse(201, { ...PROVIDER_BODY, sandbox_init_point: '' })],
    [
      'a non-https checkout URL',
      jsonResponse(201, { ...PROVIDER_BODY, sandbox_init_point: 'javascript:alert(1)' }),
    ],
  ])('rejects a malformed answer with %s', async (_label, response) => {
    const { client } = clientWith(response);

    const error = await failureOf(client.createPreference(PREFERENCE));

    expect(error).toBeInstanceOf(MercadoPagoClientError);
    expect(error.message).toBe('Mercado Pago preference response was malformed.');
  });

  it('reports a network failure or timeout without the underlying error', async () => {
    const { client } = clientWith(new Error(`connect failed for Bearer ${TOKEN}`));

    const error = await failureOf(client.createPreference(PREFERENCE));

    expect(error).toBeInstanceOf(MercadoPagoClientError);
    expect(error.message).toBe('Mercado Pago preference request failed before a response.');
    expect(error.cause).toBeUndefined();
  });

  it('never puts the access token or the response body in an error', async () => {
    const responses = [
      jsonResponse(500, { error: TOKEN }),
      new Response(`garbage ${TOKEN}`, { status: 200 }),
      new Error(`boom ${TOKEN}`),
    ];
    for (const response of responses) {
      const { client } = clientWith(response);
      const error = await failureOf(client.createPreference(PREFERENCE));
      expect(`${error.message} ${error.stack ?? ''}`).not.toContain(TOKEN);
      expect(error.message).not.toContain('should-not-leak');
    }
  });
});

describe('FetchMercadoPagoClient.getPayment', () => {
  const PAYMENT_BODY = {
    id: 1234567890,
    status: 'approved',
    transaction_amount: 1500.5,
    currency_id: 'MXN',
    external_reference: 'registration-1',
    live_mode: false,
    payer: { email: 'should-not-leak@example.test' },
  };

  it('reads the payment by id with the bearer token and a timeout', async () => {
    const { client, fetchFn } = clientWith(jsonResponse(200, PAYMENT_BODY));

    await client.getPayment('1234567890');

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/v1/payments/1234567890');
    expect(init?.method).toBe('GET');
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('encodes the payment id in the path', async () => {
    const { client, fetchFn } = clientWith(jsonResponse(200, PAYMENT_BODY));

    // The answer names another id, so it is rejected too; only the URL matters here.
    await failureOf(client.getPayment('../users/me'));

    expect(fetchFn.mock.calls[0][0]).toBe(
      'https://api.mercadopago.com/v1/payments/..%2Fusers%2Fme',
    );
  });

  it('returns only the fields the webhook needs, with the amount in cents', async () => {
    const { client } = clientWith(jsonResponse(200, PAYMENT_BODY));

    await expect(client.getPayment('1234567890')).resolves.toEqual({
      id: '1234567890',
      status: 'approved',
      transactionAmountCents: 150050,
      currencyId: 'MXN',
      externalReference: 'registration-1',
      liveMode: false,
    });
  });

  it.each([
    [19.99, 1999],
    [0.29, 29],
    [1234.56, 123456],
    [800, 80000],
    [0.1 + 0.2, 30],
  ])('converts %p pesos to %p cents', async (amount, cents) => {
    const { client } = clientWith(
      jsonResponse(200, { ...PAYMENT_BODY, transaction_amount: amount }),
    );

    const payment = await client.getPayment('1234567890');

    expect(payment.transactionAmountCents).toBe(cents);
  });

  it('accepts a payment without an external reference', async () => {
    const { client } = clientWith(jsonResponse(200, { ...PAYMENT_BODY, external_reference: null }));

    await expect(client.getPayment('1234567890')).resolves.toMatchObject({
      externalReference: null,
    });
  });

  it('reports only the status code for a non-2xx answer', async () => {
    const { client } = clientWith(jsonResponse(404, { message: `missing ${TOKEN}` }));

    const error = await failureOf(client.getPayment('1234567890'));

    expect(error).toBeInstanceOf(MercadoPagoClientError);
    expect(error.message).toBe('Mercado Pago payment request failed with status 404.');
    expect((error as MercadoPagoClientError).status).toBe(404);
  });

  it.each([
    ['a non-JSON body', new Response('not json should-not-leak', { status: 200 })],
    ['a missing id', jsonResponse(200, { ...PAYMENT_BODY, id: undefined })],
    ['a missing status', jsonResponse(200, { ...PAYMENT_BODY, status: '' })],
    ['a text amount', jsonResponse(200, { ...PAYMENT_BODY, transaction_amount: '1500.50' })],
    ['a negative amount', jsonResponse(200, { ...PAYMENT_BODY, transaction_amount: -1 })],
    ['a missing currency', jsonResponse(200, { ...PAYMENT_BODY, currency_id: undefined })],
    ['a non-boolean live mode', jsonResponse(200, { ...PAYMENT_BODY, live_mode: 'false' })],
    ['a numeric external reference', jsonResponse(200, { ...PAYMENT_BODY, external_reference: 1 })],
    ['another payment id', jsonResponse(200, { ...PAYMENT_BODY, id: 1234567891 })],
  ])('rejects a malformed answer with %s', async (_label, response) => {
    const { client } = clientWith(response);

    const error = await failureOf(client.getPayment('1234567890'));

    expect(error).toBeInstanceOf(MercadoPagoClientError);
    expect(error.message).toBe('Mercado Pago payment response was malformed.');
  });

  it('reports a network failure or timeout without the underlying error', async () => {
    const { client } = clientWith(new Error(`connect failed for Bearer ${TOKEN}`));

    const error = await failureOf(client.getPayment('1234567890'));

    expect(error).toBeInstanceOf(MercadoPagoClientError);
    expect(error.message).toBe('Mercado Pago payment request failed before a response.');
    expect((error as MercadoPagoClientError).status).toBeUndefined();
    expect(`${error.message} ${error.stack ?? ''}`).not.toContain(TOKEN);
  });
});
