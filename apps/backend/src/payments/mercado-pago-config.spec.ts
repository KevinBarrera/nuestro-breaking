import { readMercadoPagoConfig } from './mercado-pago-config';

const SANDBOX_ENV = {
  MERCADO_PAGO_MODE: 'sandbox',
  MERCADO_PAGO_ACCESS_TOKEN: 'TEST-fake-token',
  MERCADO_PAGO_WEBHOOK_SECRET: 'fake-webhook-secret',
};

describe('readMercadoPagoConfig', () => {
  it('reads a sandbox credential set', () => {
    expect(readMercadoPagoConfig(SANDBOX_ENV)).toEqual({
      mode: 'sandbox',
      accessToken: 'TEST-fake-token',
      webhookSecret: 'fake-webhook-secret',
    });
  });

  it('reads a production credential set and trims every value', () => {
    expect(
      readMercadoPagoConfig({
        MERCADO_PAGO_MODE: ' production ',
        MERCADO_PAGO_ACCESS_TOKEN: ' APP_USR-fake-token ',
        MERCADO_PAGO_WEBHOOK_SECRET: ' fake-webhook-secret ',
      }),
    ).toEqual({
      mode: 'production',
      accessToken: 'APP_USR-fake-token',
      webhookSecret: 'fake-webhook-secret',
    });
  });

  it.each(['MERCADO_PAGO_MODE', 'MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_WEBHOOK_SECRET'])(
    'fails fast when %s is missing or blank',
    (name) => {
      expect(() => readMercadoPagoConfig({ ...SANDBOX_ENV, [name]: undefined })).toThrow(
        new RegExp(`${name} is required`),
      );
      expect(() => readMercadoPagoConfig({ ...SANDBOX_ENV, [name]: '   ' })).toThrow(
        new RegExp(`${name} is required`),
      );
    },
  );

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

  it('never echoes the supplied values in its errors', () => {
    const secretToken = 'TEST-fake-token-should-not-leak';
    const secretMode = 'fake-mode-should-not-leak';
    const messages = [
      { ...SANDBOX_ENV, MERCADO_PAGO_MODE: 'production', MERCADO_PAGO_ACCESS_TOKEN: secretToken },
      { ...SANDBOX_ENV, MERCADO_PAGO_MODE: secretMode, MERCADO_PAGO_ACCESS_TOKEN: secretToken },
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
