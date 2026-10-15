export { buildConfirmationEmail } from './confirmation-email-content';
export type {
  ConfirmationEmailContent,
  ConfirmationEmailInput,
  ConfirmationEmailPass,
} from './confirmation-email-content';
export {
  CONFIRMATION_EMAIL_LEASE_SECONDS,
  CONFIRMATION_EMAIL_MAX_ATTEMPTS,
  ConfirmationEmailDispatcher,
} from './confirmation-email-dispatcher';
export type { ConfirmationEmailErrorCode, DispatchErrorCode } from './confirmation-email-policy';
export { enqueueConfirmationEmail } from './confirmation-email-outbox';
export type { OutboxTransaction } from './confirmation-email-outbox';
export { ConfirmationEmailSweeper } from './confirmation-email-sweeper';
export { EMAIL_CONFIG, readEmailConfig } from './email-config';
export type { EmailConfig } from './email-config';
export { EmailSendError, EmailSender } from './email-sender';
export type { EmailRecipient, EmailSendErrorCode, OutgoingEmail, SentEmail } from './email-sender';
export { NotificationsModule } from './notifications.module';
export { displayFirstName, readRegistrationPasses } from './registration-summary';
export type { RegistrationPassSummary } from './registration-summary';
