import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import {
  eventRegistrations,
  events,
  participants,
  registrationConfirmationEmails as outbox,
} from '@/database/schema';
import { buildConfirmationEmail } from './confirmation-email-content';
import { EmailSendError, EmailSender, type OutgoingEmail } from './email-sender';
import { readRegistrationPasses } from './registration-summary';

type Database = DatabaseService['db'];

/** A claimed attempt goes `failed` once this many attempts have been made. */
export const CONFIRMATION_EMAIL_MAX_ATTEMPTS = 8;
/**
 * How long a claim hides a row from other workers. Well above the sender's 10 s timeout, so a
 * row is only claimed again when its worker died mid-send.
 */
export const CONFIRMATION_EMAIL_LEASE_SECONDS = 120;
/** Wait before the retry after attempt n: 1 min, doubling, capped at one hour. */
export const CONFIRMATION_EMAIL_RETRY_BASE_SECONDS = 60;
export const CONFIRMATION_EMAIL_RETRY_MAX_SECONDS = 60 * 60;
/** Rows claimed by one sweep; the next sweep takes the rest. */
export const CONFIRMATION_EMAIL_SWEEP_BATCH = 20;

/** Codes stored in `last_error_code` besides the sender's own `EmailSendErrorCode`s. */
type DispatchErrorCode = 'missing_recipient' | 'not_confirmed' | 'unexpected';

interface Claim {
  id: string;
  registrationId: string;
  /** The attempt number this claim made; it also fences out stale workers. */
  attempts: number;
}

type Delivery =
  | { kind: 'sent'; providerMessageId: string | null }
  | { kind: 'error'; code: string; retryable: boolean };

/**
 * Sends the queued confirmation emails (#179 D3). A row is first claimed in a short statement
 * (`FOR UPDATE SKIP LOCKED`), which counts the attempt and leases the row; the email is then built
 * and sent outside any transaction, so no lock is held during the provider call. The result is
 * written only while the row still carries this claim's attempt, so a worker whose lease expired
 * cannot overwrite a newer outcome. Logs carry registration ids and codes only, never names,
 * addresses, subjects or bodies.
 */
@Injectable()
export class ConfirmationEmailDispatcher {
  private readonly logger = new Logger(ConfirmationEmailDispatcher.name);
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: Database,
    private readonly sender: EmailSender,
  ) {}

  /** Tries one registration's email now, if it is due and no other worker holds it. */
  dispatchRegistration(registrationId: string): Promise<void> {
    return this.track(async () => {
      const [claim] = await this.claim(1, registrationId);
      if (claim) await this.deliver(claim);
    });
  }

  /** Tries up to one batch of due emails, one after another. */
  sweep(): Promise<void> {
    return this.track(async () => {
      for (const claim of await this.claim(CONFIRMATION_EMAIL_SWEEP_BATCH)) {
        await this.deliver(claim);
      }
    });
  }

  /** Resolves once every dispatch started so far has finished. */
  async whenIdle(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.allSettled([...this.inFlight]);
  }

  private track(work: () => Promise<void>): Promise<void> {
    const running = work();
    const tracked = running.then(
      () => undefined,
      () => undefined,
    );
    this.inFlight.add(tracked);
    void tracked.finally(() => this.inFlight.delete(tracked));
    return running;
  }

  private async claim(limit: number, registrationId?: string): Promise<Claim[]> {
    const due = this.db
      .select({ id: outbox.id })
      .from(outbox)
      .where(
        and(
          eq(outbox.status, 'pending'),
          lte(outbox.nextAttemptAt, sql`now()`),
          registrationId ? eq(outbox.registrationId, registrationId) : undefined,
        ),
      )
      .orderBy(asc(outbox.nextAttemptAt))
      .limit(limit)
      .for('update', { skipLocked: true });
    return this.db
      .update(outbox)
      .set({
        attempts: sql`${outbox.attempts} + 1`,
        nextAttemptAt: sql`now() + make_interval(secs => ${CONFIRMATION_EMAIL_LEASE_SECONDS})`,
        updatedAt: sql`now()`,
      })
      .where(inArray(outbox.id, due))
      .returning({
        id: outbox.id,
        registrationId: outbox.registrationId,
        attempts: outbox.attempts,
      });
  }

  private async deliver(claim: Claim): Promise<void> {
    const result = await this.attempt(claim);
    if (result.kind === 'sent') {
      await this.record(claim, {
        status: 'sent',
        providerMessageId: result.providerMessageId,
        sentAt: sql`now()`,
        lastErrorCode: null,
      });
      this.logger.log(`Confirmation email for registration ${claim.registrationId} sent.`);
      return;
    }
    if (!result.retryable || claim.attempts >= CONFIRMATION_EMAIL_MAX_ATTEMPTS) {
      await this.record(claim, { status: 'failed', lastErrorCode: result.code });
      this.logger.error(
        `Confirmation email for registration ${claim.registrationId} failed (${result.code}) after ${claim.attempts} attempt(s); it needs manual follow-up.`,
      );
      return;
    }
    await this.record(claim, {
      lastErrorCode: result.code,
      nextAttemptAt: sql`now() + make_interval(secs => ${retryDelaySeconds(claim.attempts)})`,
    });
    this.logger.warn(
      `Confirmation email for registration ${claim.registrationId} attempt ${claim.attempts} failed (${result.code}); it will be retried.`,
    );
  }

  private async attempt(claim: Claim): Promise<Delivery> {
    try {
      const message = await this.compose(claim.registrationId);
      if (typeof message === 'string') return { kind: 'error', code: message, retryable: false };
      const sent = await this.sender.send(message);
      return { kind: 'sent', providerMessageId: sent.providerMessageId };
    } catch (error) {
      return error instanceof EmailSendError
        ? { kind: 'error', code: error.code, retryable: error.retryable }
        : { kind: 'error', code: 'unexpected' satisfies DispatchErrorCode, retryable: true };
    }
  }

  private async compose(registrationId: string): Promise<OutgoingEmail | DispatchErrorCode> {
    const [row] = await this.db
      .select({
        eventId: eventRegistrations.eventId,
        status: eventRegistrations.status,
        folio: eventRegistrations.folio,
        firstName: participants.firstName,
        fullName: participants.fullName,
        email: participants.email,
        eventName: events.name,
        eventTimeZone: events.timeZone,
        eventStartsAt: events.startsAt,
      })
      .from(eventRegistrations)
      .innerJoin(participants, eq(participants.id, eventRegistrations.participantId))
      .innerJoin(events, eq(events.id, eventRegistrations.eventId))
      .where(eq(eventRegistrations.id, registrationId));
    if (!row || row.status !== 'confirmed' || !row.folio) return 'not_confirmed';
    if (!row.email?.trim()) return 'missing_recipient';

    const passes = await readRegistrationPasses(this.db, row.eventId, registrationId);
    const content = buildConfirmationEmail({
      firstName: row.firstName,
      fullName: row.fullName,
      eventName: row.eventName,
      eventTimeZone: row.eventTimeZone,
      eventStartsAt: row.eventStartsAt,
      folio: row.folio,
      passes,
    });
    return { to: { email: row.email.trim(), name: row.fullName }, ...content };
  }

  /** Writes an outcome only while the row is still pending under this claim's attempt. */
  private async record(claim: Claim, values: PgUpdateSetSource<typeof outbox>) {
    await this.db
      .update(outbox)
      .set({ ...values, updatedAt: sql`now()` })
      .where(
        and(
          eq(outbox.id, claim.id),
          eq(outbox.status, 'pending'),
          eq(outbox.attempts, claim.attempts),
        ),
      );
  }
}

function retryDelaySeconds(attempts: number): number {
  return Math.min(
    CONFIRMATION_EMAIL_RETRY_BASE_SECONDS * 2 ** (attempts - 1),
    CONFIRMATION_EMAIL_RETRY_MAX_SECONDS,
  );
}
