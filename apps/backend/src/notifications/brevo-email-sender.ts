import type { EmailConfig } from './email-config';
import { EmailSendError, EmailSender, type OutgoingEmail, type SentEmail } from './email-sender';

const SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const DEFAULT_TIMEOUT_MS = 10_000;
const SANDBOX_HEADER = 'X-Sib-Sandbox';
const SANDBOX_VALUE = 'drop';

/**
 * `EmailSender` over Brevo's transactional API and Node's global `fetch` (ADR 0007). In sandbox
 * mode the sandbox header goes both as an HTTP header and in the payload's `headers` object, so
 * Brevo drops the message whichever place it reads. Errors carry only a status and a fixed code:
 * never the API key, the recipient, the content, the provider's body or the network error.
 */
export class BrevoEmailSender extends EmailSender {
  constructor(
    private readonly config: EmailConfig,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    super();
  }

  async send(message: OutgoingEmail): Promise<SentEmail> {
    const headers: Record<string, string> = {
      'api-key': this.config.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.config.sandbox) headers[SANDBOX_HEADER] = SANDBOX_VALUE;

    let response: Response;
    try {
      response = await this.fetchFn(SEND_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(this.payload(message)),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new EmailSendError('network', true);
    }
    if (!response.ok) throw failureFor(response.status);

    const body: unknown = await response.json().catch(() => null);
    return { providerMessageId: messageId(body) };
  }

  private payload(message: OutgoingEmail) {
    const { email, name } = message.to;
    return {
      sender: { email: this.config.senderAddress, name: this.config.senderName },
      to: [name ? { email, name } : { email }],
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text,
      ...(this.config.sandbox ? { headers: { [SANDBOX_HEADER]: SANDBOX_VALUE } } : {}),
    };
  }
}

function failureFor(status: number): EmailSendError {
  if (status === 429) return new EmailSendError('rate_limited', true, status);
  if (status >= 500) return new EmailSendError('provider_unavailable', true, status);
  if (status === 401 || status === 403) return new EmailSendError('unauthorized', false, status);
  return new EmailSendError('rejected', false, status);
}

function messageId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as Record<string, unknown>).messageId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}
