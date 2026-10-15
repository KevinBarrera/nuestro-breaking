import { readEmailConfig } from './email-config';

const ENV = {
  BREVO_API_KEY: 'xkeysib-fake-key',
  EMAIL_SENDER_ADDRESS: 'boletos@example.test',
  EMAIL_SENDER_NAME: 'Los más pesados',
  EMAIL_SANDBOX: 'true',
};

describe('readEmailConfig', () => {
  it('reads the Brevo key, the sender and the sandbox flag', () => {
    expect(readEmailConfig(ENV)).toEqual({
      apiKey: 'xkeysib-fake-key',
      senderAddress: 'boletos@example.test',
      senderName: 'Los más pesados',
      sandbox: true,
      dispatchIntervalMs: 60_000,
    });
  });

  it('trims every value', () => {
    expect(
      readEmailConfig({
        BREVO_API_KEY: ' xkeysib-fake-key ',
        EMAIL_SENDER_ADDRESS: ' boletos@example.test ',
        EMAIL_SENDER_NAME: ' Los más pesados ',
        EMAIL_SANDBOX: ' false ',
      }),
    ).toEqual({
      apiKey: 'xkeysib-fake-key',
      senderAddress: 'boletos@example.test',
      senderName: 'Los más pesados',
      sandbox: false,
      dispatchIntervalMs: 60_000,
    });
  });

  it.each(['BREVO_API_KEY', 'EMAIL_SENDER_ADDRESS', 'EMAIL_SENDER_NAME'])(
    'fails fast when %s is missing or blank',
    (name) => {
      expect(() => readEmailConfig({ ...ENV, [name]: undefined })).toThrow(
        new RegExp(`${name} is required`),
      );
      expect(() => readEmailConfig({ ...ENV, [name]: '   ' })).toThrow(
        new RegExp(`${name} is required`),
      );
    },
  );

  it.each(['TRUE', 'yes', '1', 'drop'])('rejects EMAIL_SANDBOX %p', (value) => {
    expect(() => readEmailConfig({ ...ENV, EMAIL_SANDBOX: value })).toThrow(
      /EMAIL_SANDBOX must be "true" or "false"/,
    );
  });

  it('defaults to sandbox outside production when EMAIL_SANDBOX is absent or blank', () => {
    expect(readEmailConfig({ ...ENV, EMAIL_SANDBOX: undefined }).sandbox).toBe(true);
    expect(readEmailConfig({ ...ENV, EMAIL_SANDBOX: ' ', NODE_ENV: 'development' }).sandbox).toBe(
      true,
    );
  });

  it('defaults to real delivery in production when EMAIL_SANDBOX is absent', () => {
    expect(
      readEmailConfig({ ...ENV, EMAIL_SANDBOX: undefined, NODE_ENV: 'production' }).sandbox,
    ).toBe(false);
  });

  it('lets an explicit EMAIL_SANDBOX win in production', () => {
    expect(readEmailConfig({ ...ENV, NODE_ENV: 'production' }).sandbox).toBe(true);
  });

  it('reads the dispatch interval, where 0 turns the periodic retry off', () => {
    expect(
      readEmailConfig({ ...ENV, EMAIL_DISPATCH_INTERVAL_MS: ' 30000 ' }).dispatchIntervalMs,
    ).toBe(30_000);
    expect(readEmailConfig({ ...ENV, EMAIL_DISPATCH_INTERVAL_MS: '0' }).dispatchIntervalMs).toBe(0);
    expect(readEmailConfig({ ...ENV, EMAIL_DISPATCH_INTERVAL_MS: ' ' }).dispatchIntervalMs).toBe(
      60_000,
    );
  });

  it.each(['-1', '1.5', 'abc', '1e3', '999', '86400001'])(
    'rejects EMAIL_DISPATCH_INTERVAL_MS %p',
    (value) => {
      expect(() => readEmailConfig({ ...ENV, EMAIL_DISPATCH_INTERVAL_MS: value })).toThrow(
        /EMAIL_DISPATCH_INTERVAL_MS must be 0 or a whole number of milliseconds from 1000 to 86400000/,
      );
    },
  );

  it.each(['boletos', 'boletos@', '@example.test', 'boletos@example', 'a b@example.test'])(
    'rejects sender address %p',
    (value) => {
      expect(() => readEmailConfig({ ...ENV, EMAIL_SENDER_ADDRESS: value })).toThrow(
        /EMAIL_SENDER_ADDRESS must be an email address/,
      );
    },
  );

  it('never echoes the supplied values in its errors', () => {
    const messages = [
      { ...ENV, EMAIL_SANDBOX: 'should-not-leak' },
      { ...ENV, EMAIL_SENDER_ADDRESS: 'should-not-leak' },
    ].map((env) => {
      try {
        readEmailConfig(env);
      } catch (error) {
        return (error as Error).message;
      }
      throw new Error('expected readEmailConfig to throw');
    });

    for (const message of messages) {
      expect(message).not.toContain('should-not-leak');
      expect(message).not.toContain('xkeysib-fake-key');
    }
  });
});
