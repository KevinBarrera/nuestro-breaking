import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { BrevoEmailSender } from './brevo-email-sender';
import { ConfirmationEmailDispatcher } from './confirmation-email-dispatcher';
import { ConfirmationEmailSweeper } from './confirmation-email-sweeper';
import { EMAIL_CONFIG, readEmailConfig, type EmailConfig } from './email-config';
import { EmailSender } from './email-sender';

/**
 * Outgoing email (#179). The config is read once when the app boots: a missing or invalid value
 * stops the boot. Brevo stays behind `EmailSender`, so the provider can be swapped (ADR 0007).
 * The payments webhook asks `ConfirmationEmailDispatcher` for an immediate send after it commits a
 * confirmation; `ConfirmationEmailSweeper` retries whatever is still due.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: EMAIL_CONFIG, useFactory: () => readEmailConfig(process.env) },
    {
      provide: EmailSender,
      useFactory: (config: EmailConfig) => new BrevoEmailSender(config),
      inject: [EMAIL_CONFIG],
    },
    ConfirmationEmailDispatcher,
    ConfirmationEmailSweeper,
  ],
  exports: [EMAIL_CONFIG, EmailSender, ConfirmationEmailDispatcher],
})
export class NotificationsModule {}
