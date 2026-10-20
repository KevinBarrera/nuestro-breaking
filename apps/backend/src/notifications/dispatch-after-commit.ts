import type { Logger } from '@nestjs/common';
import type { ConfirmationEmailDispatcher } from './confirmation-email-dispatcher';

/**
 * Tries a just-committed confirmation email now, fire and forget, for every confirmation path (the
 * payments webhook, cash and complimentary confirmations). The outbox row is already committed, so
 * the sweep retries whatever fails here; the caller's answer never waits for or depends on the send.
 */
export function dispatchAfterCommit(
  dispatcher: Pick<ConfirmationEmailDispatcher, 'dispatchRegistration'>,
  registrationId: string,
  logger: Pick<Logger, 'error'>,
): void {
  dispatcher.dispatchRegistration(registrationId).catch((error: unknown) => {
    logger.error(
      `Confirmation email dispatch for registration ${registrationId} failed (${error instanceof Error ? error.name : 'unknown'}); the sweep will retry it.`,
    );
  });
}
