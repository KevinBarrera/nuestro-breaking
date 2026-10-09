import { readMercadoPagoConfig } from './mercado-pago-config';

const SANDBOX_ENV = {
  MERCADO_PAGO_MODE: 'sandbox',
  MERCADO_PAGO_ACCESS_TOKEN: 'TEST-fake-token',
  MERCADO_PAGO_WEBHOOK_SECRET: 'fake-webhook-secret',
  PUBLIC_APP_URL: 'https://example.test',
  MERCADO_PAGO_NOTIFICATION_URL: 'https://api.example.test/public/payments/mercado-pago/webhook',
};

describe('readMercadoPagoConfig', () => {
  it('reads a sandbox credential set', () => {
    expect(readMercadoPagoConfig(SANDBOX_ENV)).toEqual({
      mode: 'sandbox',
      accessToken: 'TEST-fake-token',
      webhookSecret: 'fake-webhook-secret',
      publicAppUrl: 'https://example.test',
      notificationUrl: 'https://api.example.test/public/payments/mercado-pago/webhook',
    });
  });

  it('reads a production credential set and trims every value', () => {
    expect(
      readMercadoPagoConfig({
        MERCADO_PAGO_MODE: ' production ',
        MERCADO_PAGO_ACCESS_TOKEN: ' APP_USR-fake-token ',
        MERCADO_PAGO_WEBHOOK_SECRET: ' fake-webhook-secret ',
        PUBLIC_APP_URL: ' https://example.test ',
        MERCADO_PAGO_NOTIFICATION_URL: ' https://api.example.test/webhook ',
      }),
    ).toEqual({
      mode: 'production',
      accessToken: 'APP_USR-fake-token',
      webhookSecret: 'fake-webhook-secret',
      publicAppUrl: 'https://example.test',
      notificationUrl: 'https://api.example.test/webhook',
    });
  });

  it.each([
    'MERCADO_PAGO_MODE',
    'MERCADO_PAGO_ACCESS_TOKEN',
    'MERCADO_PAGO_WEBHOOK_SECRET',
    'PUBLIC_APP_URL',
    'MERCADO_PAGO_NOTIFICATION_URL',
  ])('fails fast when %s is missing or blank', (name) => {
    expect(() => readMercadoPagoConfig({ ...SANDBOX_ENV, [name]: undefined })).toThrow(
      new RegExp(`${name} is required`),
    );
    expect(() => readMercadoPagoConfig({ ...SANDBOX_ENV, [name]: '   ' })).toThrow(
      new RegExp(`${name} is required`),
    );
  });

  it.each(['Sandbox', 'PRODUCTION', 'test', 'prod'])('rejects mode %p', (value) => {
    expect(() => readMercadoPagoConfig({ ...SANDBOX_ENV, MERCADO_PAGO_MODE: value })).toThrow(
      /MERCADO_PAGO_MODE must be "sandbox" or "production"/,
    );
  });

  it('rejects a test access token in production mode', () => {
    expect(() =>
      readMercadoPagoConfig({ ...SANDBOX_ENV, MERCADO_PAGO_MODE: 'production' }),
    ).toThrow(/MERCADO_PAGO_ACCESS_TOKEN must not be a TEST- credential in production mode/);
  });

  it('accepts an http public app origin for local development', () => {
    expect(
      readMercadoPagoConfig({ ...SANDBOX_ENV, PUBLIC_APP_URL: 'http://localhost:5173' })
        .publicAppUrl,
    ).toBe('http://localhost:5173');
  });

  it.each([
    'https://example.test/',
    'https://example.test/e/slug',
    'https://example.test?x=1',
    'ftp://example.test',
    'example.test',
    'https://*.example.test',
  ])('rejects public app URL %p that is not an exact http(s) origin', (value) => {
    expect(() => readMercadoPagoConfig({ ...SANDBOX_ENV, PUBLIC_APP_URL: value })).toThrow(
      /PUBLIC_APP_URL must be an exact http\(s\) origin/,
    );
  });

  it.each(['/webhook', 'not a url', 'ftp://example.test/webhook'])(
    'rejects notification URL %p that is not an absolute http(s) URL',
    (value) => {
      expect(() =>
        readMercadoPagoConfig({ ...SANDBOX_ENV, MERCADO_PAGO_NOTIFICATION_URL: value }),
      ).toThrow(/MERCADO_PAGO_NOTIFICATION_URL must be an absolute http\(s\) URL/);
    },
  );

  it('allows an http notification URL in sandbox mode only', () => {
    const httpUrl = 'http://tunnel.example.test/webhook';
    expect(
      readMercadoPagoConfig({ ...SANDBOX_ENV, MERCADO_PAGO_NOTIFICATION_URL: httpUrl })
        .notificationUrl,
    ).toBe(httpUrl);
    expect(() =>
      readMercadoPagoConfig({
        ...SANDBOX_ENV,
        MERCADO_PAGO_MODE: 'production',
        MERCADO_PAGO_ACCESS_TOKEN: 'APP_USR-fake-token',
        MERCADO_PAGO_NOTIFICATION_URL: httpUrl,
      }),
    ).toThrow(/MERCADO_PAGO_NOTIFICATION_URL must use https in production mode/);
  });

  it('never echoes the supplied values in its errors', () => {
    const secretToken = 'TEST-fake-token-should-not-leak';
    const secretMode = 'fake-mode-should-not-leak';
    const messages = [
      { ...SANDBOX_ENV, MERCADO_PAGO_MODE: 'production', MERCADO_PAGO_ACCESS_TOKEN: secretToken },
      { ...SANDBOX_ENV, MERCADO_PAGO_MODE: secretMode, MERCADO_PAGO_ACCESS_TOKEN: secretToken },
      { ...SANDBOX_ENV, PUBLIC_APP_URL: 'https://should-not-leak.example.test/path' },
      { ...SANDBOX_ENV, MERCADO_PAGO_NOTIFICATION_URL: 'should-not-leak' },
    ].map((env) => {
      try {
        readMercadoPagoConfig(env);
      } catch (error) {
        return (error as Error).message;
      }
      throw new Error('expected readMercadoPagoConfig to throw');
    });

    for (const message of messages) {
      expect(message).not.toContain(secretToken);
      expect(message).not.toContain('should-not-leak');
      expect(message).not.toContain('fake-webhook-secret');
    }
  });
});
