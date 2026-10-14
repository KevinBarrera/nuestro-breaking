import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { and, asc, eq, exists, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import { eventRegistrations, registrationCheckouts } from '@/database/schema';
import { EXPIRY_SWEEP_INTERVAL_MS } from '@/events/registration-expiry';
import { MercadoPagoClient, MercadoPagoClientError } from '@/payments/mercado-pago-client';
import { MERCADO_PAGO_CONFIG, type MercadoPagoConfig } from '@/payments/mercado-pago-config';
import { PaymentWebhookService } from '@/payments/webhook/payment-webhook.service';

type Database = DatabaseService['db'];

// At most this many registrations are reconciled per sweep; the rest wait for the next tick.
const REGISTRATIONS_PER_SWEEP = 20;
// Older expiries are left alone: Mercado Pago refunds payments made after the window, so a missed
// approval this late is a support case, not an automatic one.
const LOOKBACK = sql`interval '30 days'`;

/**
 * Searches the Mercado Pago payments of each expired online registration once (#181 S6), so an
 * approval whose notifications never arrived (a credential outage, an early 404 after which
 * Mercado Pago stopped retrying) is still applied, through the webhook's own logic: a pending
 * registration is confirmed, an expired one follows the late approval rule. It runs on the expiry
 * sweep's interval (`PENDING_EXPIRY_SWEEP_INTERVAL_MS`, `0` turns both off) with the same
 * guarantees: no overlap, an unref'd timer, and shutdown waits for the sweep in flight. The provider
 * calls happen outside any database lock. A transient failure (network, timeout, 429, 5xx, a
 * credential refusal while reading) leaves the registration unreconciled, so a later sweep tries
 * again; a permanent search refusal (another 4xx) counts as searched.
 */
@Injectable()
export class PaymentReconciliationSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PaymentReconciliationSweeper.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;

  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: Database,
    @Inject(MERCADO_PAGO_CONFIG) private readonly config: MercadoPagoConfig,
    @Inject(EXPIRY_SWEEP_INTERVAL_MS) private readonly intervalMs: number,
    private readonly mercadoPago: MercadoPagoClient,
    private readonly webhook: PaymentWebhookService,
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
          `Payment reconciliation sweep failed (${error instanceof Error ? error.name : 'unknown'}); it runs again on the next tick.`,
        );
      })
      .finally(() => (this.running = undefined));
    await this.running;
  }

  /** Reconciles what is due now and returns how many registrations were reconciled. */
  async sweep(): Promise<number> {
    const due = await this.db
      .select({ id: eventRegistrations.id })
      .from(eventRegistrations)
      .where(
        and(
          inArray(eventRegistrations.status, ['pending_payment', 'voided']),
          isNull(eventRegistrations.paymentsReconciledAt),
          lte(eventRegistrations.expiresAt, sql`now()`),
          gt(eventRegistrations.expiresAt, sql`now() - ${LOOKBACK}`),
          exists(
            this.db
              .select({ id: registrationCheckouts.id })
              .from(registrationCheckouts)
              .where(
                and(
                  eq(registrationCheckouts.registrationId, eventRegistrations.id),
                  eq(registrationCheckouts.mode, this.config.mode),
                ),
              ),
          ),
        ),
      )
      .orderBy(asc(eventRegistrations.expiresAt), asc(eventRegistrations.id))
      .limit(REGISTRATIONS_PER_SWEEP);
    let reconciled = 0;
    for (const { id } of due) {
      try {
        const payments = await this.searchPayments(id);
        for (const payment of payments) await this.webhook.reconcile(payment.id);
        await this.db
          .update(eventRegistrations)
          .set({ paymentsReconciledAt: sql`now()` })
          .where(eq(eventRegistrations.id, id));
        reconciled += 1;
      } catch (error) {
        // Client errors are token-free by construction; anything else is logged by kind only.
        this.logger.warn(
          error instanceof MercadoPagoClientError
            ? `${error.message} Registration ${id} is reconciled on a later sweep.`
            : `Payment reconciliation for registration ${id} failed (${error instanceof Error ? error.name : 'unknown'}); it is retried on a later sweep.`,
        );
      }
    }
    return reconciled;
  }

  /**
   * A 4xx other than 429 will never succeed (a retry would only keep this registration ahead of
   * newer ones), so it counts as searched with no payments, with a warning for operators.
   */
  private async searchPayments(registrationId: string) {
    try {
      return await this.mercadoPago.searchPayments(registrationId);
    } catch (error) {
      const status = error instanceof MercadoPagoClientError ? error.status : undefined;
      if (status === undefined || status < 400 || status >= 500 || status === 429) throw error;
      this.logger.warn(
        `Mercado Pago refused the payment search for registration ${registrationId} with ${status}; it is not searched again.`,
      );
      return [];
    }
  }
}
