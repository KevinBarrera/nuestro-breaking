import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfirmationEmailDispatcher } from './confirmation-email-dispatcher';
import { EMAIL_CONFIG, type EmailConfig } from './email-config';

/**
 * Retries due confirmation emails every `EMAIL_DISPATCH_INTERVAL_MS` (#179 D3) inside the backend
 * process: no queue or scheduler dependency. A sweep never overlaps the previous one, and the
 * timer never keeps the process alive. On shutdown it stops the timer and waits for in-flight
 * sends; this module is destroyed before the database module it imports, so the pool is still open.
 */
@Injectable()
export class ConfirmationEmailSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ConfirmationEmailSweeper.name);
  private timer?: NodeJS.Timeout;
  private sweeping = false;

  constructor(
    @Inject(EMAIL_CONFIG) private readonly config: EmailConfig,
    private readonly dispatcher: ConfirmationEmailDispatcher,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.dispatchIntervalMs === 0) return;
    this.timer = setInterval(() => void this.tick(), this.config.dispatchIntervalMs);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    await this.dispatcher.whenIdle();
  }

  /** One sweep, skipped while the previous one still runs. */
  async tick(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      await this.dispatcher.sweep();
    } catch (error) {
      // A database error can quote query parameters, so only its kind is logged.
      this.logger.error(
        `Confirmation email sweep failed (${error instanceof Error ? error.name : 'unknown'}); it runs again on the next tick.`,
      );
    } finally {
      this.sweeping = false;
    }
  }
}
