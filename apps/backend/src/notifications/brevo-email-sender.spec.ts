import { BrevoEmailSender } from './brevo-email-sender';
import type { EmailConfig } from './email-config';
import { EmailSendError, type OutgoingEmail } from './email-sender';

const API_KEY = 'xkeysib-fake-key-should-not-leak';
const CONFIG: EmailConfig = {
  apiKey: API_KEY,
  senderAddress: 'boletos@example.test',
  senderName: 'Los más pesados',
  sandbox: false,
};
const MESSAGE: OutgoingEmail = {
  to: { email: 'buyer-should-not-leak@example.test', name: 'Ana' },
  subject: 'Tu registro está confirmado',
  html: '<p>body-should-not-leak</p>',
  text: 'body-should-not-leak',
};

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function senderWith(response: Response | Error, config: EmailConfig = CONFIG) {
  const fetchFn = jest.fn<Promise<Response>, Parameters<typeof fetch>>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  return { sender: new BrevoEmailSender(config, fetchFn), fetchFn };
}

async function failureOf(promise: Promise<unknown>): Promise<EmailSendError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(EmailSendError);
    return error as EmailSendError;
  }
  throw new Error('expected the send to fail');
}

function expectNoLeak(error: Error) {
  for (const secret of [API_KEY, 'buyer-should-not-leak', 'body-should-not-leak']) {
    expect(error.message).not.toContain(secret);
    expect(String(error.stack)).not.toContain(secret);
  }
}

describe('BrevoEmailSender', () => {
  it('posts the message to Brevo with the API key, JSON body and a timeout', async () => {
    const { sender, fetchFn } = senderWith(jsonResponse(201, { messageId: '<abc@smtp>' }));

    await expect(sender.send(MESSAGE)).resolves.toEqual({ providerMessageId: '<abc@smtp>' });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers['api-key']).toBe(API_KEY);
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Accept).toBe('application/json');
    expect(headers['X-Sib-Sandbox']).toBeUndefined();
    expect(JSON.parse(init?.body as string)).toEqual({
      sender: { email: 'boletos@example.test', name: 'Los más pesados' },
      to: [{ email: 'buyer-should-not-leak@example.test', name: 'Ana' }],
      subject: 'Tu registro está confirmado',
      htmlContent: '<p>body-should-not-leak</p>',
      textContent: 'body-should-not-leak',
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('omits the recipient name when the message has none', async () => {
    const { sender, fetchFn } = senderWith(jsonResponse(201, { messageId: 'm-1' }));

    await sender.send({ ...MESSAGE, to: { email: 'buyer@example.test' } });

    const body = JSON.parse(fetchFn.mock.calls[0][1]?.body as string) as { to: unknown };
    expect(body.to).toEqual([{ email: 'buyer@example.test' }]);
  });

  it('adds the sandbox header to the request and to the payload in sandbox mode', async () => {
    const { sender, fetchFn } = senderWith(jsonResponse(201, { messageId: 'm-1' }), {
      ...CONFIG,
      sandbox: true,
    });

    await sender.send(MESSAGE);

    const init = fetchFn.mock.calls[0][1];
    expect((init?.headers as Record<string, string>)['X-Sib-Sandbox']).toBe('drop');
    const body = JSON.parse(init?.body as string) as { headers?: unknown };
    expect(body.headers).toEqual({ 'X-Sib-Sandbox': 'drop' });
  });

  it('returns a null message id when a 2xx answer has none', async () => {
    const { sender } = senderWith(new Response(null, { status: 202 }));

    await expect(sender.send(MESSAGE)).resolves.toEqual({ providerMessageId: null });
  });

  it.each([429, 500, 502, 503])('maps status %i to a retryable error', async (status) => {
    const { sender } = senderWith(
      jsonResponse(status, { message: `${API_KEY} body-should-not-leak` }),
    );

    const error = await failureOf(sender.send(MESSAGE));

    expect(error.retryable).toBe(true);
    expect(error.status).toBe(status);
    expect(error.code).toBe(status === 429 ? 'rate_limited' : 'provider_unavailable');
    expectNoLeak(error);
  });

  it.each([
    [400, 'rejected'],
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [404, 'rejected'],
  ])('maps status %i to a non-retryable %s error', async (status, code) => {
    const { sender } = senderWith(
      jsonResponse(status, { code: 'invalid_parameter', message: 'buyer-should-not-leak' }),
    );

    const error = await failureOf(sender.send(MESSAGE));

    expect(error.retryable).toBe(false);
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
    expectNoLeak(error);
  });

  it('maps a network failure or timeout to a retryable error without the cause', async () => {
    const { sender } = senderWith(new Error(`connect failed ${API_KEY} buyer-should-not-leak`));

    const error = await failureOf(sender.send(MESSAGE));

    expect(error.retryable).toBe(true);
    expect(error.code).toBe('network');
    expect(error.status).toBeUndefined();
    expectNoLeak(error);
  });

  it('times out a hung request', async () => {
    const fetchFn = jest.fn<Promise<Response>, Parameters<typeof fetch>>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const sender = new BrevoEmailSender(CONFIG, fetchFn, 10);

    const error = await failureOf(sender.send(MESSAGE));

    expect(error.retryable).toBe(true);
    expect(error.code).toBe('network');
  });
});
