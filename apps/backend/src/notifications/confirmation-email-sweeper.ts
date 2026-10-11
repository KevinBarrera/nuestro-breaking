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
 * sends (immediate dispatches included), so their results are recorded before the pool closes.
 * This wait must stay in `onModuleDestroy`: Nest runs that hook in reverse import depth, so this
 * module goes before the `DatabaseModule` it imports, whose `DatabaseService` ends the pool in its
 * own `onModuleDestroy`. `beforeApplicationShutdown` would be too late, because Nest calls it only
 * after every `onModuleDestroy` (Nest 11 `NestApplicationContext.close`). The e2e
 * `confirmation-email-dispatch` spec proves the order with a send in flight.
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
