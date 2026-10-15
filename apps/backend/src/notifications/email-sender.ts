export interface EmailRecipient {
  email: string;
  name?: string;
}

/** One transactional email, already rendered. */
export interface OutgoingEmail {
  to: EmailRecipient;
  subject: string;
  html: string;
  text: string;
}

export interface SentEmail {
  /** The provider's id for the accepted message, when it returned one. */
  providerMessageId: string | null;
}

/**
 * Safe, fixed failure categories. `network` covers timeouts and failures before a response;
 * `rate_limited` and `provider_unavailable` are worth retrying; `unauthorized` and `rejected`
 * need a person to fix the credential, sender or message.
 */
export type EmailSendErrorCode =
  'network' | 'rate_limited' | 'provider_unavailable' | 'unauthorized' | 'rejected';

/**
 * Thrown by a sender for any delivery failure. Its message never holds the API key, the
 * recipient, the content or the provider's body. `status` is the provider's HTTP status when it
 * answered.
 */
export class EmailSendError extends Error {
  constructor(
    readonly code: EmailSendErrorCode,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(
      status === undefined
        ? `Email send failed (${code}).`
        : `Email send failed with status ${status} (${code}).`,
    );
    this.name = 'EmailSendError';
  }
}

/** Sends one transactional email. Also the injection token, so specs and e2e can stub it. */
export abstract class EmailSender {
  abstract send(message: OutgoingEmail): Promise<SentEmail>;
}
