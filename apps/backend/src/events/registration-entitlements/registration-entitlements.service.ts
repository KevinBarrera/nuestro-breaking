import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import {
  activities,
  eventPassTypeActivities,
  eventPassTypes,
  eventRegistrationPassSelections,
  eventRegistrationPasses,
  eventRegistrations,
  registrationOperationAudit,
} from '@/database/schema';
import type { PassClass } from '@/events/pass-type-admin/pass-type-admin.types';
import { FULL_INCLUDES_GENERAL_MESSAGE, addingCombinesGeneralWithFull } from './pass-class-rules';
import type {
  EntitlementActor,
  HeldPass,
  RegistrationEntitlements,
} from './registration-entitlements.types';

type Database = DatabaseService['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Executor = Database | Transaction;
type RegistrationRow = typeof eventRegistrations.$inferSelect;

const byId = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

@Injectable()
export class RegistrationEntitlementsService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: Database) {}

  async read(eventId: string, registrationId: string): Promise<RegistrationEntitlements> {
    const [registration] = await this.db
      .select({ id: eventRegistrations.id })
      .from(eventRegistrations)
      .where(
        and(eq(eventRegistrations.id, registrationId), eq(eventRegistrations.eventId, eventId)),
      );
    if (!registration) throw new NotFoundException('Registration not found');
    return this.entitlements(this.db, eventId, registrationId);
  }

  // Activities a registration may access: the active `included` activities of every held pass
  // type plus the active activities selected on each held pass. Purely data-driven: a pass type
  // without access rows (e.g. general entry) grants nothing. Reusable inside other transactions.
  async accessibleActivityIds(
    executor: Executor,
    eventId: string,
    registrationId: string,
  ): Promise<string[]> {
    const held = and(
      eq(eventRegistrationPasses.eventId, eventId),
      eq(eventRegistrationPasses.eventRegistrationId, registrationId),
    );
    const included = executor
      .select({ id: activities.id })
      .from(eventRegistrationPasses)
      .innerJoin(
        eventPassTypeActivities,
        and(
          eq(eventPassTypeActivities.eventId, eventRegistrationPasses.eventId),
          eq(eventPassTypeActivities.passTypeId, eventRegistrationPasses.passTypeId),
          eq(eventPassTypeActivities.access, 'included'),
        ),
      )
      .innerJoin(
        activities,
        and(
          eq(activities.eventId, eventPassTypeActivities.eventId),
          eq(activities.id, eventPassTypeActivities.activityId),
          eq(activities.status, 'active'),
        ),
      )
      .where(held);
    const selected = executor
      .select({ id: activities.id })
      .from(eventRegistrationPasses)
      .innerJoin(
        eventRegistrationPassSelections,
        and(
          eq(eventRegistrationPassSelections.eventId, eventRegistrationPasses.eventId),
          eq(eventRegistrationPassSelections.registrationPassId, eventRegistrationPasses.id),
        ),
      )
      .innerJoin(
        activities,
        and(
          eq(activities.eventId, eventRegistrationPassSelections.eventId),
          eq(activities.id, eventRegistrationPassSelections.activityId),
          eq(activities.status, 'active'),
        ),
      )
      .where(held);
    const rows = await included.union(selected);
    return rows.map((row) => row.id).sort(byId);
  }

  async addPass(
    eventId: string,
    registrationId: string,
    passTypeId: string,
    actor: EntitlementActor,
  ): Promise<RegistrationEntitlements> {
    return this.db.transaction(async (tx) => {
      const registration = await this.lockRegistration(tx, eventId, registrationId);
      if (registration.status !== 'pending_payment')
        throw new ConflictException('Registration is not pending payment');
      // Share lock keeps a concurrent archive or price edit from interleaving with the snapshot.
      const [passType] = await tx
        .select()
        .from(eventPassTypes)
        .where(and(eq(eventPassTypes.id, passTypeId), eq(eventPassTypes.eventId, eventId)))
        .for('share');
      if (!passType) throw new NotFoundException('Pass type not found');
      if (passType.status !== 'active') throw new ConflictException('Pass type is archived');
      const heldClasses = await tx
        .select({ passTypeId: eventPassTypes.id, passClass: eventPassTypes.passClass })
        .from(eventRegistrationPasses)
        .innerJoin(
          eventPassTypes,
          and(
            eq(eventPassTypes.eventId, eventRegistrationPasses.eventId),
            eq(eventPassTypes.id, eventRegistrationPasses.passTypeId),
          ),
        )
        .where(
          and(
            eq(eventRegistrationPasses.eventId, eventId),
            eq(eventRegistrationPasses.eventRegistrationId, registrationId),
          ),
        );
      if (heldClasses.some((held) => held.passTypeId === passTypeId))
        throw new ConflictException('Registration already holds this pass type');
      // Archived pass types still count: the requirement is about what was purchased.
      const heldPassClasses = heldClasses.map((held) => held.passClass as PassClass);
      if (addingCombinesGeneralWithFull(heldPassClasses, passType.passClass as PassClass))
        throw new ConflictException(FULL_INCLUDES_GENERAL_MESSAGE);
      const required = passType.requiresPassClass;
      if (required && !heldClasses.some((held) => held.passClass === required))
        throw new BadRequestException(`Add-on requires a ${required} pass`);
      const [created] = await tx
        .insert(eventRegistrationPasses)
        .values({
          eventId,
          eventRegistrationId: registrationId,
          passTypeId,
          priceCents: passType.priceCents,
        })
        .returning({ id: eventRegistrationPasses.id });
      const facts = { registrationPassId: created.id, passTypeId };
      await this.audit(tx, actor, registration, {
        operationType: 'pass_assignment',
        affectedActivityIds: [],
        beforeState: { registrationPass: null },
        afterState: { ...facts, priceCents: passType.priceCents, selections: [] },
        facts,
      });
      return this.entitlements(tx, eventId, registrationId);
    });
  }

  async replaceSelections(
    eventId: string,
    registrationId: string,
    registrationPassId: string,
    activityIds: string[],
    actor: EntitlementActor,
  ): Promise<RegistrationEntitlements> {
    return this.db.transaction(async (tx) => {
      const registration = await this.lockRegistration(tx, eventId, registrationId);
      if (registration.status === 'voided') throw new ConflictException('Registration is voided');
      const [held] = await tx
        .select({ id: eventRegistrationPasses.id, passTypeId: eventRegistrationPasses.passTypeId })
        .from(eventRegistrationPasses)
        .where(
          and(
            eq(eventRegistrationPasses.id, registrationPassId),
            eq(eventRegistrationPasses.eventId, eventId),
            eq(eventRegistrationPasses.eventRegistrationId, registrationId),
          ),
        );
      if (!held) throw new NotFoundException('Registration pass not found');
      // Share lock serializes against access-list replacement, which locks the pass type for update.
      await tx
        .select({ id: eventPassTypes.id })
        .from(eventPassTypes)
        .where(and(eq(eventPassTypes.id, held.passTypeId), eq(eventPassTypes.eventId, eventId)))
        .for('share');
      await this.assertSelectable(tx, eventId, held.passTypeId, activityIds);
      const previous = await this.selections(tx, eventId, registrationPassId);
      await tx
        .delete(eventRegistrationPassSelections)
        .where(
          and(
            eq(eventRegistrationPassSelections.eventId, eventId),
            eq(eventRegistrationPassSelections.registrationPassId, registrationPassId),
          ),
        );
      if (activityIds.length > 0)
        await tx
          .insert(eventRegistrationPassSelections)
          .values(activityIds.map((activityId) => ({ eventId, registrationPassId, activityId })));
      const next = [...activityIds].sort(byId);
      await this.audit(tx, actor, registration, {
        operationType: 'pass_selection_change',
        affectedActivityIds: [...new Set([...previous, ...next])].sort(byId),
        beforeState: { registrationPassId, selections: previous },
        afterState: { registrationPassId, selections: next },
        facts: { registrationPassId, passTypeId: held.passTypeId },
      });
      return this.entitlements(tx, eventId, registrationId);
    });
  }

  // Row lock serializes entitlement writes per registration (duplicate and class checks included).
  private async lockRegistration(
    tx: Transaction,
    eventId: string,
    registrationId: string,
  ): Promise<RegistrationRow> {
    const [registration] = await tx
      .select()
      .from(eventRegistrations)
      .where(
        and(eq(eventRegistrations.id, registrationId), eq(eventRegistrations.eventId, eventId)),
      )
      .for('update');
    if (!registration) throw new NotFoundException('Registration not found');
    return registration;
  }

  // Every activity must be active and `selectable` for this pass type in the same event; the
  // activities are share-locked so a concurrent archive cannot slip in before commit.
  private async assertSelectable(
    tx: Transaction,
    eventId: string,
    passTypeId: string,
    activityIds: string[],
  ) {
    if (activityIds.length === 0) return;
    const usable = await tx
      .select({ id: activities.id })
      .from(eventPassTypeActivities)
      .innerJoin(
        activities,
        and(
          eq(activities.eventId, eventPassTypeActivities.eventId),
          eq(activities.id, eventPassTypeActivities.activityId),
        ),
      )
      .where(
        and(
          eq(eventPassTypeActivities.eventId, eventId),
          eq(eventPassTypeActivities.passTypeId, passTypeId),
          eq(eventPassTypeActivities.access, 'selectable'),
          eq(activities.status, 'active'),
          inArray(activities.id, activityIds),
        ),
      )
      .for('share', { of: activities });
    if (usable.length !== activityIds.length)
      throw new BadRequestException('Invalid activity selection');
  }

  private async selections(
    executor: Executor,
    eventId: string,
    registrationPassId: string,
  ): Promise<string[]> {
    const rows = await executor
      .select({ activityId: eventRegistrationPassSelections.activityId })
      .from(eventRegistrationPassSelections)
      .where(
        and(
          eq(eventRegistrationPassSelections.eventId, eventId),
          eq(eventRegistrationPassSelections.registrationPassId, registrationPassId),
        ),
      );
    return rows.map((row) => row.activityId).sort(byId);
  }

  private async entitlements(
    executor: Executor,
    eventId: string,
    registrationId: string,
  ): Promise<RegistrationEntitlements> {
    const rows = await executor
      .select({
        registrationPassId: eventRegistrationPasses.id,
        passTypeId: eventRegistrationPasses.passTypeId,
        name: eventPassTypes.name,
        passClass: eventPassTypes.passClass,
        priceCents: eventRegistrationPasses.priceCents,
      })
      .from(eventRegistrationPasses)
      .innerJoin(
        eventPassTypes,
        and(
          eq(eventPassTypes.eventId, eventRegistrationPasses.eventId),
          eq(eventPassTypes.id, eventRegistrationPasses.passTypeId),
        ),
      )
      .where(
        and(
          eq(eventRegistrationPasses.eventId, eventId),
          eq(eventRegistrationPasses.eventRegistrationId, registrationId),
        ),
      )
      .orderBy(asc(eventRegistrationPasses.createdAt), asc(eventRegistrationPasses.id));
    const passIds = rows.map((row) => row.registrationPassId);
    const chosen =
      passIds.length === 0
        ? []
        : await executor
            .select({
              registrationPassId: eventRegistrationPassSelections.registrationPassId,
              activityId: eventRegistrationPassSelections.activityId,
            })
            .from(eventRegistrationPassSelections)
            .where(
              and(
                eq(eventRegistrationPassSelections.eventId, eventId),
                inArray(eventRegistrationPassSelections.registrationPassId, passIds),
              ),
            );
    const passes: HeldPass[] = rows.map((row) => ({
      ...row,
      passClass: row.passClass as PassClass,
      selections: chosen
        .filter((choice) => choice.registrationPassId === row.registrationPassId)
        .map((choice) => choice.activityId)
        .sort(byId),
    }));
    return {
      passes,
      accessibleActivityIds: await this.accessibleActivityIds(executor, eventId, registrationId),
    };
  }

  private async audit(
    tx: Transaction,
    actor: EntitlementActor,
    registration: RegistrationRow,
    fact: {
      operationType: 'pass_assignment' | 'pass_selection_change';
      affectedActivityIds: string[];
      beforeState: Record<string, unknown>;
      afterState: Record<string, unknown>;
      facts: Record<string, unknown>;
    },
  ) {
    await tx.insert(registrationOperationAudit).values({
      ...fact,
      actorUserId: actor.userId,
      sessionId: actor.sessionId,
      eventId: registration.eventId,
      registrationId: registration.id,
      participantId: registration.participantId,
    });
  }
}
