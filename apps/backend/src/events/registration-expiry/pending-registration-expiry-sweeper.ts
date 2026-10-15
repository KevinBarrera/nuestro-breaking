import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { and, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import { eventRegistrations } from '@/database/schema';
import type { Environment } from '@/http';
import { expireDueRegistrations } from './expire-registrations';

type Database = DatabaseService['db'];

/** Injection token for the sweep interval in milliseconds; `0` turns the sweep off. */
export const EXPIRY_SWEEP_INTERVAL_MS = Symbol('EXPIRY_SWEEP_INTERVAL_MS');

const DEFAULT_INTERVAL_MS = 300_000;
const MIN_INTERVAL_MS = 1_000;
const MAX_INTERVAL_MS = 86_400_000;
// One sweep handles at most this many events and registrations per event; the rest wait for the
// next tick.
const EVENTS_PER_SWEEP = 20;
const REGISTRATIONS_PER_EVENT = 100;

export function readExpirySweepInterval(env: Environment): number {
  const value = env.PENDING_EXPIRY_SWEEP_INTERVAL_MS?.trim();
  if (!value) return DEFAULT_INTERVAL_MS;
  const interval = /^\d+$/.test(value) ? Number(value) : NaN;
  if (interval === 0 || (interval >= MIN_INTERVAL_MS && interval <= MAX_INTERVAL_MS))
    return interval;
  throw new Error(
    `PENDING_EXPIRY_SWEEP_INTERVAL_MS must be 0 or a whole number of milliseconds from ${MIN_INTERVAL_MS} to ${MAX_INTERVAL_MS}.`,
  );
}

/**
 * Voids expired online pending registrations every `PENDING_EXPIRY_SWEEP_INTERVAL_MS` (#181 S2)
 * inside the backend process, like the confirmation email sweeper: no scheduler dependency, no
 * overlapping sweeps, and a timer that never keeps the process alive. A purchase or checkout
 * also expires what is due on its own, so the sweep only keeps the lists current.
 * Each event is swept under the same per-event advisory lock as purchases and manual
 * registrations, so a sweep never races a reuse of the same registration. On shutdown the sweep
 * in flight finishes before the database pool closes (see `ConfirmationEmailSweeper`).
 */
@Injectable()
export class PendingRegistrationExpirySweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PendingRegistrationExpirySweeper.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;

  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: Database,
    @Inject(EXPIRY_SWEEP_INTERVAL_MS) private readonly intervalMs: number,
  ) {}

  onApplicationBootstrap(): void {
    if (this.intervalMs === 0) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    await this.running;
  }

  /** One sweep, skipped while the previous one still runs. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = this.sweep()
      .then(() => undefined)
      .catch((error: unknown) => {
        // A database error can quote query parameters, so only its kind is logged.
        this.logger.error(
          `Pending registration expiry sweep failed (${error instanceof Error ? error.name : 'unknown'}); it runs again on the next tick.`,
        );
      })
      .finally(() => (this.running = undefined));
    await this.running;
  }

  /** Expires what is due now and returns how many registrations were voided. */
  async sweep(): Promise<number> {
    const events = await this.db
      .selectDistinct({ eventId: eventRegistrations.eventId })
      .from(eventRegistrations)
      .where(
        and(
          eq(eventRegistrations.status, 'pending_payment'),
          isNotNull(eventRegistrations.expiresAt),
          lte(eventRegistrations.expiresAt, sql`now()`),
        ),
      )
      .limit(EVENTS_PER_SWEEP);
    let voided = 0;
    for (const { eventId } of events) {
      // One failing event must not keep the others from being swept.
      try {
        voided += await this.sweepEvent(eventId);
      } catch (error) {
        this.logger.error(
          `Pending registration expiry failed for event ${eventId} (${error instanceof Error ? error.name : 'unknown'}); it is retried on the next tick.`,
        );
      }
    }
    if (voided > 0) this.logger.log(`Voided ${voided} expired pending registrations.`);
    return voided;
  }

  private sweepEvent(eventId: string): Promise<number> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`);
      return expireDueRegistrations(
        tx,
        { eventId },
        { limit: REGISTRATIONS_PER_EVENT, skipLocked: true },
      );
    });
  }
}
