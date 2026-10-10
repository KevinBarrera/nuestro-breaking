import { Module } from '@nestjs/common';
import { BrevoEmailSender } from './brevo-email-sender';
import { EMAIL_CONFIG, readEmailConfig, type EmailConfig } from './email-config';
import { EmailSender } from './email-sender';

/**
 * Outgoing email (#179). The config is read once when the app boots: a missing or invalid value
 * stops the boot. Brevo stays behind `EmailSender`, so the provider can be swapped (ADR 0007).
 */
@Module({
  providers: [
    { provide: EMAIL_CONFIG, useFactory: () => readEmailConfig(process.env) },
    {
      provide: EmailSender,
      useFactory: (config: EmailConfig) => new BrevoEmailSender(config),
      inject: [EMAIL_CONFIG],
    },
  ],
  exports: [EMAIL_CONFIG, EmailSender],
})
export class NotificationsModule {}
