import type { EmailSendErrorCode } from './email-sender';

/** Wait before the retry after attempt n: 1 min, doubling, capped at one hour. */
export const CONFIRMATION_EMAIL_RETRY_BASE_SECONDS = 60;
export const CONFIRMATION_EMAIL_RETRY_MAX_SECONDS = 60 * 60;

/**
 * Codes the dispatcher stores in `last_error_code` besides the sender's own. `registration_missing`
 * and `missing_folio` are data defects (foreign keys and a check constraint should prevent them);
 * `not_confirmed` means the registration left `confirmed`.
 */
export type DispatchErrorCode =
  'registration_missing' | 'not_confirmed' | 'missing_folio' | 'missing_recipient' | 'unexpected';

/** Every code written to `last_error_code`; the runbook explains each one. */
export type ConfirmationEmailErrorCode = EmailSendErrorCode | DispatchErrorCode;

export function retryDelaySeconds(attempts: number): number {
  return Math.min(
    CONFIRMATION_EMAIL_RETRY_BASE_SECONDS * 2 ** (attempts - 1),
    CONFIRMATION_EMAIL_RETRY_MAX_SECONDS,
  );
}

interface RegistrationToSend {
  status: string;
  folio: string | null;
  email: string | null;
}

export type SendableCheck<T extends RegistrationToSend> =
  { sendable: T & { folio: string; email: string } } | { reason: DispatchErrorCode };

/** The registration narrowed to what an email needs, or why its email cannot be sent. */
export function checkSendable<T extends RegistrationToSend>(
  registration: T | undefined,
): SendableCheck<T> {
  if (!registration) return { reason: 'registration_missing' };
  if (registration.status !== 'confirmed') return { reason: 'not_confirmed' };
  const { folio } = registration;
  if (!folio) return { reason: 'missing_folio' };
  const email = registration.email?.trim();
  if (!email) return { reason: 'missing_recipient' };
  return { sendable: { ...registration, folio, email } };
}
