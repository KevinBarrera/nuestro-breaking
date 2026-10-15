import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import {
  eventRegistrations,
  events,
  participants,
  registrationCheckouts,
  registrationConfirmationEmails as outbox,
  registrationPayments,
} from '@/database/schema';
import { buildConfirmationEmail } from './confirmation-email-content';
import {
  checkSendable,
  retryDelaySeconds,
  type ConfirmationEmailErrorCode,
  type DispatchErrorCode,
} from './confirmation-email-policy';
import { EmailSendError, EmailSender, type OutgoingEmail } from './email-sender';
import { readRegistrationPasses } from './registration-summary';

type Database = DatabaseService['db'];

/** A claimed attempt goes `failed` once this many attempts have been made. */
export const CONFIRMATION_EMAIL_MAX_ATTEMPTS = 8;
/**
 * How long a claim hides a row from other workers. Each row is claimed right before its own send,
 * and the lease is well above the sender's 10 s timeout, so a row is only claimed again when its
 * worker died mid-send.
 */
export const CONFIRMATION_EMAIL_LEASE_SECONDS = 120;
/** Rows one sweep sends at most, claiming one at a time; the next sweep takes the rest. */
export const CONFIRMATION_EMAIL_SWEEP_BATCH = 20;

interface Claim {
  id: string;
  registrationId: string;
  /** The attempt number this claim made; it also fences out stale workers. */
  attempts: number;
}

type Delivery =
  | { kind: 'sent'; providerMessageId: string | null }
  | { kind: 'error'; code: ConfirmationEmailErrorCode; retryable: boolean };

/** What `record` writes for a claim. */
type Outcome =
  | { kind: 'sent'; providerMessageId: string | null }
  | { kind: 'failed'; code: ConfirmationEmailErrorCode }
  | { kind: 'retry'; code: ConfirmationEmailErrorCode; delaySeconds: number };

/**
 * Sends the queued confirmation emails (#179 D3). Each row is claimed right before its send in a
 * short statement (`FOR UPDATE SKIP LOCKED`), which counts the attempt and leases the row; the
 * email is then built and sent outside any transaction, so no lock is held during the provider
 * call. The result is written only while the row still carries this claim's attempt, so a worker
 * whose lease expired cannot overwrite a newer outcome, and logs its result as ignored. Logs carry
 * registration ids, attempt numbers and codes only, never names, addresses, subjects or bodies.
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

  /**
   * Tries up to one batch of due emails, one after another. Each row is claimed only when its turn
   * comes, so its lease starts right before its own send and a slow batch cannot outlive it.
   */
  sweep(): Promise<void> {
    return this.track(async () => {
      for (let sent = 0; sent < CONFIRMATION_EMAIL_SWEEP_BATCH; sent++) {
        const [claim] = await this.claim(1);
        if (!claim) return;
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
    const outcome = toOutcome(claim, await this.attempt(claim));
    const { registrationId, attempts } = claim;
    if (!(await this.record(claim, outcome))) {
      this.logger.warn(
        `Confirmation email for registration ${registrationId} attempt ${attempts} finished after its lease expired; result ignored.`,
      );
      return;
    }
    if (outcome.kind === 'sent') {
      this.logger.log(
        `Confirmation email for registration ${registrationId} sent on attempt ${attempts}.`,
      );
    } else if (outcome.kind === 'failed') {
      this.logger.error(
        `Confirmation email for registration ${registrationId} marked failed (${outcome.code}) after ${attempts} attempt(s); it needs manual follow-up.`,
      );
    } else {
      this.logger.warn(
        `Confirmation email for registration ${registrationId} attempt ${attempts} failed (${outcome.code}); retry scheduled.`,
      );
    }
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
    const check = checkSendable(row);
    if ('reason' in check) return check.reason;
    const registration = check.sendable;

    const passes = await readRegistrationPasses(this.db, registration.eventId, registrationId);
    // The service charge of the checkout behind the approved payment (#239); cash and manual
    // registrations have no approved online payment.
    const [charged] = await this.db
      .select({ serviceChargeCents: registrationCheckouts.serviceChargeCents })
      .from(registrationPayments)
      .innerJoin(
        registrationCheckouts,
        eq(registrationCheckouts.id, registrationPayments.checkoutId),
      )
      .where(
        and(
          eq(registrationCheckouts.registrationId, registrationId),
          eq(registrationPayments.status, 'approved'),
        ),
      )
      .orderBy(desc(registrationPayments.createdAt), desc(registrationPayments.id))
      .limit(1);
    const content = buildConfirmationEmail({
      firstName: registration.firstName,
      fullName: registration.fullName,
      eventName: registration.eventName,
      eventTimeZone: registration.eventTimeZone,
      eventStartsAt: registration.eventStartsAt,
      folio: registration.folio,
      passes,
      payment: charged
        ? {
            passesCents: passes.reduce((total, pass) => total + pass.priceCents, 0),
            serviceChargeCents: charged.serviceChargeCents,
          }
        : null,
    });
    return { to: { email: registration.email, name: registration.fullName }, ...content };
  }

  /**
   * Writes an outcome only while the row is still pending under this claim's attempt. Returns
   * false when a newer claim owns the row, so nothing was written.
   */
  private async record(claim: Claim, outcome: Outcome): Promise<boolean> {
    const values =
      outcome.kind === 'sent'
        ? {
            status: 'sent' as const,
            providerMessageId: outcome.providerMessageId,
            sentAt: sql`now()`,
            lastErrorCode: null,
          }
        : outcome.kind === 'failed'
          ? { status: 'failed' as const, lastErrorCode: outcome.code }
          : {
              lastErrorCode: outcome.code,
              nextAttemptAt: sql`now() + make_interval(secs => ${outcome.delaySeconds})`,
            };
    const written = await this.db
      .update(outbox)
      .set({ ...values, updatedAt: sql`now()` })
      .where(
        and(
          eq(outbox.id, claim.id),
          eq(outbox.status, 'pending'),
          eq(outbox.attempts, claim.attempts),
        ),
      )
      .returning({ id: outbox.id });
    return written.length > 0;
  }
}

function toOutcome(claim: Claim, delivery: Delivery): Outcome {
  if (delivery.kind === 'sent') return delivery;
  if (!delivery.retryable || claim.attempts >= CONFIRMATION_EMAIL_MAX_ATTEMPTS) {
    return { kind: 'failed', code: delivery.code };
  }
  return {
    kind: 'retry',
    code: delivery.code,
    delaySeconds: retryDelaySeconds(claim.attempts),
  };
}
