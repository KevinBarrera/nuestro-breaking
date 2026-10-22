import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import {
  activities,
  eventCheckIns,
  eventPassTypeActivities,
  eventPassTypes,
  eventRegistrationPassSelections,
  eventRegistrationPasses,
  eventRegistrations,
  participants,
  registrationOperationAudit,
} from '@/database/schema';
import { participantContactMatch } from '@/events/manual-registration/manual-registration.service';
import type { PassClass } from '@/events/pass-type-admin/pass-type-admin.types';
import { buildFullName } from '@/events/participant-profile/participant-normalization';
import {
  type AdminRegistrationAuditActor,
  type RegistrationAuditActor,
  registrationAuditActorColumns,
} from '@/events/registration-audit/registration-audit-actor';
import {
  FULL_INCLUDES_GENERAL_MESSAGE,
  addingCombinesGeneralWithFull,
  passesRequiringRemoved,
} from './pass-class-rules';
import { areSelectableActivities } from './selectable-activities';
import type {
  DisciplineSwap,
  HeldPass,
  ParticipantCorrection,
  RegistrationEntitlements,
  RegistrationStatus,
  RegistrationSummary,
} from './registration-entitlements.types';

type Database = DatabaseService['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Executor = Database | Transaction;
type RegistrationRow = typeof eventRegistrations.$inferSelect;

const byId = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

export const REASON_MESSAGE = 'Reason is required and must be 1 to 500 characters';

const CORRECTED_FIELDS = ['firstName', 'firstLastName', 'secondLastName', 'stageName'] as const;

@Injectable()
export class RegistrationEntitlementsService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: Database) {}

  async read(eventId: string, registrationId: string): Promise<RegistrationEntitlements> {
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
    const byRegistration = await this.accessibleActivityIdsByRegistration(executor, eventId, [
      registrationId,
    ]);
    return byRegistration.get(registrationId) ?? [];
  }

  // Batched form of `accessibleActivityIds` (the single source of the access rule) for list
  // screens: one query for every registration, each list sorted by id. Registrations without
  // access get an empty list.
  async accessibleActivityIdsByRegistration(
    executor: Executor,
    eventId: string,
    registrationIds: readonly string[],
  ): Promise<Map<string, string[]>> {
    const result = new Map(registrationIds.map((id) => [id, [] as string[]]));
    if (registrationIds.length === 0) return result;
    const held = and(
      eq(eventRegistrationPasses.eventId, eventId),
      inArray(eventRegistrationPasses.eventRegistrationId, [...registrationIds]),
    );
    const included = executor
      .select({ registrationId: eventRegistrationPasses.eventRegistrationId, id: activities.id })
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
      .select({ registrationId: eventRegistrationPasses.eventRegistrationId, id: activities.id })
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
    for (const row of await included.union(selected)) result.get(row.registrationId)?.push(row.id);
    for (const ids of result.values()) ids.sort(byId);
    return result;
  }

  // Classes of every held pass per registration, archived pass types included (what was bought).
  async heldPassClassesByRegistration(
    executor: Executor,
    eventId: string,
    registrationIds: readonly string[],
  ): Promise<Map<string, PassClass[]>> {
    const result = new Map(registrationIds.map((id) => [id, [] as PassClass[]]));
    if (registrationIds.length === 0) return result;
    const rows = await executor
      .select({
        registrationId: eventRegistrationPasses.eventRegistrationId,
        passClass: eventPassTypes.passClass,
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
          inArray(eventRegistrationPasses.eventRegistrationId, [...registrationIds]),
        ),
      );
    for (const row of rows) result.get(row.registrationId)?.push(row.passClass as PassClass);
    return result;
  }

  async addPass(
    eventId: string,
    registrationId: string,
    passTypeId: string,
    actor: AdminRegistrationAuditActor,
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

  // Undoes a mistaken in-person sale line before payment (#282). Online checkouts keep the passes
  // the buyer chose, and confirmed registrations are out of scope.
  async removePass(
    eventId: string,
    registrationId: string,
    registrationPassId: string,
    actor: AdminRegistrationAuditActor,
  ): Promise<RegistrationEntitlements> {
    return this.db.transaction(async (tx) => {
      const registration = await this.lockRegistration(tx, eventId, registrationId);
      if (registration.status !== 'pending_payment')
        throw new ConflictException('Registration is not pending payment');
      if (registration.expiresAt !== null)
        throw new ConflictException('Online registrations cannot lose a pass');
      // Archived pass types still count: the requirement is about what was purchased.
      const held = await tx
        .select({
          registrationPassId: eventRegistrationPasses.id,
          passTypeId: eventRegistrationPasses.passTypeId,
          priceCents: eventRegistrationPasses.priceCents,
          name: eventPassTypes.name,
          passClass: eventPassTypes.passClass,
          requiresPassClass: eventPassTypes.requiresPassClass,
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
        );
      const removed = held.find((pass) => pass.registrationPassId === registrationPassId);
      if (!removed) throw new NotFoundException('Registration pass not found');
      const dependents = passesRequiringRemoved(
        held.map((pass) => ({
          ...pass,
          passClass: pass.passClass as PassClass,
          requiresPassClass: pass.requiresPassClass as PassClass | null,
        })),
        registrationPassId,
      );
      if (dependents.length > 0) {
        const names = dependents.map((name) => `«${name}»`).join(', ');
        const verb = dependents.length === 1 ? 'it requires' : 'they require';
        throw new ConflictException({
          statusCode: 409,
          message: `Remove ${names} first; ${verb} this pass`,
          code: 'pass_required_by_add_on',
        });
      }
      const selections = await this.selections(tx, eventId, registrationPassId);
      await tx
        .delete(eventRegistrationPassSelections)
        .where(
          and(
            eq(eventRegistrationPassSelections.eventId, eventId),
            eq(eventRegistrationPassSelections.registrationPassId, registrationPassId),
          ),
        );
      await tx
        .delete(eventRegistrationPasses)
        .where(
          and(
            eq(eventRegistrationPasses.id, registrationPassId),
            eq(eventRegistrationPasses.eventId, eventId),
          ),
        );
      const { passTypeId, priceCents } = removed;
      const facts = { registrationPassId, passTypeId };
      await this.audit(tx, actor, registration, {
        operationType: 'pass_removal',
        affectedActivityIds: selections,
        beforeState: { registrationPass: { ...facts, priceCents, selections } },
        afterState: { registrationPass: null },
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
    reason: string | null,
    actor: AdminRegistrationAuditActor,
  ): Promise<RegistrationEntitlements> {
    return this.db.transaction(async (tx) => {
      const registration = await this.lockRegistration(tx, eventId, registrationId);
      if (registration.status === 'voided') throw new ConflictException('Registration is voided');
      // A confirmed registration was already charged, so changing what it covers needs evidence (#170).
      if (registration.status === 'confirmed' && !reason)
        throw new BadRequestException({
          statusCode: 400,
          message: REASON_MESSAGE,
          code: 'selection_change_reason_required',
        });
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
        note: reason,
      });
      return this.entitlements(tx, eventId, registrationId);
    });
  }

  // Voids a mistaken in-person registration before payment (#104). Online checkouts expire on their
  // own, so a void never leaves a live payment behind; passes and selections stay as history.
  async voidRegistration(
    eventId: string,
    registrationId: string,
    reason: string | null,
    actor: AdminRegistrationAuditActor,
  ): Promise<RegistrationEntitlements> {
    return this.db.transaction(async (tx) => {
      const registration = await this.lockRegistration(tx, eventId, registrationId);
      if (!reason)
        throw new BadRequestException({
          statusCode: 400,
          message: REASON_MESSAGE,
          code: 'void_reason_required',
        });
      if (registration.status !== 'pending_payment')
        throw new ConflictException('Registration is not pending payment');
      if (registration.expiresAt !== null)
        throw new ConflictException({
          statusCode: 409,
          message: 'Online registrations cannot be voided',
          code: 'online_registration_void_locked',
        });
      const activityIds = await this.accessibleActivityIds(tx, eventId, registrationId);
      await tx
        .update(eventRegistrations)
        .set({ status: 'voided', updatedAt: sql`now()` })
        .where(eq(eventRegistrations.id, registrationId));
      await this.audit(tx, actor, registration, {
        operationType: 'registration_void',
        affectedActivityIds: activityIds,
        beforeState: {
          status: 'pending_payment',
          confirmationSource: null,
          confirmedAt: null,
          participantId: registration.participantId,
          activityIds,
        },
        afterState: { status: 'voided', confirmationSource: null, confirmedAt: null },
        facts: {},
        note: reason,
      });
      return this.entitlements(tx, eventId, registrationId);
    });
  }

  // Corrects the name parts and AKA of the registration's own participant (#104). Participants are
  // not shared across events, so other events never change; when the same person (email or phone)
  // holds registrations there, the administrator must confirm the count first. The audit keeps
  // which fields changed, never the names.
  async correctParticipant(
    eventId: string,
    registrationId: string,
    correction: ParticipantCorrection,
    reason: string | null,
    actor: AdminRegistrationAuditActor,
  ): Promise<RegistrationEntitlements> {
    return this.db.transaction(async (tx) => {
      const registration = await this.lockRegistration(tx, eventId, registrationId);
      if (!reason)
        throw new BadRequestException({
          statusCode: 400,
          message: REASON_MESSAGE,
          code: 'correction_reason_required',
        });
      if (registration.status === 'voided')
        throw new ConflictException({
          statusCode: 409,
          message: 'Registration is voided',
          code: 'registration_voided',
        });
      const [current] = await tx
        .select()
        .from(participants)
        .where(eq(participants.id, registration.participantId));
      const changedFields = CORRECTED_FIELDS.filter(
        (field) => current[field] !== correction[field],
      );
      if (changedFields.length === 0)
        throw new BadRequestException({
          statusCode: 400,
          message: 'The correction changes nothing',
          code: 'correction_no_changes',
        });
      const otherEventCount = await this.otherEventCount(tx, eventId, current);
      if (otherEventCount > 0 && !correction.confirmCrossEvent)
        throw new ConflictException({
          statusCode: 409,
          message: 'The participant is registered in other events',
          code: 'cross_event_confirmation_required',
          otherEventCount,
        });
      const { firstName, firstLastName, secondLastName, stageName } = correction;
      await tx
        .update(participants)
        .set({
          firstName,
          firstLastName,
          secondLastName,
          stageName,
          fullName: buildFullName(firstName, firstLastName, secondLastName),
          updatedAt: sql`now()`,
        })
        .where(eq(participants.id, current.id));
      const state = { status: registration.status, participantId: registration.participantId };
      await this.audit(tx, actor, registration, {
        operationType: 'registration_correction',
        affectedActivityIds: [],
        beforeState: state,
        afterState: state,
        facts: { changedFields, otherEventCount, crossEventConfirmed: otherEventCount > 0 },
        note: reason,
      });
      return this.entitlements(tx, eventId, registrationId);
    });
  }

  // Moves the registration's single full pass to another active full pass of the same current
  // price (#104), replacing its competitions. The stored price snapshot stays (what was charged),
  // so no amount, checkout or payment fact changes. Rejected once the person entered the event.
  async swapDiscipline(
    eventId: string,
    registrationId: string,
    swap: DisciplineSwap,
    reason: string | null,
    actor: AdminRegistrationAuditActor,
  ): Promise<RegistrationEntitlements> {
    return this.db.transaction(async (tx) => {
      const registration = await this.lockRegistration(tx, eventId, registrationId);
      if (!reason)
        throw new BadRequestException({
          statusCode: 400,
          message: REASON_MESSAGE,
          code: 'correction_reason_required',
        });
      if (registration.status === 'voided')
        throw new ConflictException({
          statusCode: 409,
          message: 'Registration is voided',
          code: 'registration_voided',
        });
      // Archived pass types still count: the requirement is about what was purchased.
      const fullPasses = await tx
        .select({ id: eventRegistrationPasses.id, passTypeId: eventRegistrationPasses.passTypeId })
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
            eq(eventPassTypes.passClass, 'full'),
          ),
        );
      if (fullPasses.length !== 1)
        throw new ConflictException({
          statusCode: 409,
          message: 'Registration must hold exactly one full pass',
          code: 'discipline_swap_single_full_pass_required',
        });
      const [held] = fullPasses;
      const [checkIn] = await tx
        .select({ id: eventCheckIns.id })
        .from(eventCheckIns)
        .where(
          and(
            eq(eventCheckIns.eventId, eventId),
            eq(eventCheckIns.eventRegistrationId, registrationId),
          ),
        );
      if (checkIn)
        throw new ConflictException({
          statusCode: 409,
          message: 'Registration is already checked in',
          code: 'discipline_swap_checked_in',
        });
      // Share locks keep a concurrent archive, price or access edit from interleaving.
      const [target] = await tx
        .select()
        .from(eventPassTypes)
        .where(and(eq(eventPassTypes.id, swap.toPassTypeId), eq(eventPassTypes.eventId, eventId)))
        .for('share');
      if (
        !target ||
        target.passClass !== 'full' ||
        target.status !== 'active' ||
        target.id === held.passTypeId
      )
        throw new BadRequestException({
          statusCode: 400,
          message: 'Target must be another active full pass of this event',
          code: 'discipline_swap_invalid_target',
        });
      const [current] = await tx
        .select({ priceCents: eventPassTypes.priceCents })
        .from(eventPassTypes)
        .where(and(eq(eventPassTypes.id, held.passTypeId), eq(eventPassTypes.eventId, eventId)))
        .for('share');
      if (current.priceCents !== target.priceCents)
        throw new ConflictException({
          statusCode: 409,
          message: 'Both passes must have the same current price',
          code: 'discipline_swap_price_mismatch',
        });
      await this.assertSelectable(tx, eventId, target.id, swap.activityIds);
      const previous = await this.selections(tx, eventId, held.id);
      await tx
        .delete(eventRegistrationPassSelections)
        .where(
          and(
            eq(eventRegistrationPassSelections.eventId, eventId),
            eq(eventRegistrationPassSelections.registrationPassId, held.id),
          ),
        );
      await tx
        .update(eventRegistrationPasses)
        .set({ passTypeId: target.id })
        .where(
          and(
            eq(eventRegistrationPasses.id, held.id),
            eq(eventRegistrationPasses.eventId, eventId),
          ),
        );
      if (swap.activityIds.length > 0)
        await tx.insert(eventRegistrationPassSelections).values(
          swap.activityIds.map((activityId) => ({
            eventId,
            registrationPassId: held.id,
            activityId,
          })),
        );
      const next = [...swap.activityIds].sort(byId);
      const { status } = registration;
      await this.audit(tx, actor, registration, {
        operationType: 'registration_discipline_swap',
        affectedActivityIds: [...new Set([...previous, ...next])].sort(byId),
        beforeState: { status, passTypeId: held.passTypeId },
        afterState: { status, passTypeId: target.id },
        facts: {
          fromPassTypeId: held.passTypeId,
          toPassTypeId: target.id,
          fromActivityIds: previous,
          toActivityIds: next,
        },
        note: reason,
      });
      return this.entitlements(tx, eventId, registrationId);
    });
  }

  // Other events with a registration, not voided, of the same person by the duplicate rule.
  private async otherEventCount(
    tx: Transaction,
    eventId: string,
    contact: { email: string | null; phone: string | null },
  ): Promise<number> {
    const match = participantContactMatch(contact);
    if (!match) return 0;
    const [row] = await tx
      .select({ count: sql<number>`count(DISTINCT ${eventRegistrations.eventId})::int` })
      .from(eventRegistrations)
      .innerJoin(participants, eq(participants.id, eventRegistrations.participantId))
      .where(
        and(
          ne(eventRegistrations.eventId, eventId),
          ne(eventRegistrations.status, 'voided'),
          match,
        ),
      );
    return row.count;
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

  private async assertSelectable(
    tx: Transaction,
    eventId: string,
    passTypeId: string,
    activityIds: string[],
  ) {
    if (!(await areSelectableActivities(tx, eventId, passTypeId, activityIds)))
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

  // Only the name, its parts and the AKA of the participant: the sale screen needs no contact data.
  private async summary(
    executor: Executor,
    eventId: string,
    registrationId: string,
  ): Promise<RegistrationSummary> {
    const [row] = await executor
      .select({
        id: eventRegistrations.id,
        status: eventRegistrations.status,
        folio: eventRegistrations.folio,
        expiresAt: eventRegistrations.expiresAt,
        fullName: participants.fullName,
        firstName: participants.firstName,
        firstLastName: participants.firstLastName,
        secondLastName: participants.secondLastName,
        stageName: participants.stageName,
      })
      .from(eventRegistrations)
      .innerJoin(participants, eq(participants.id, eventRegistrations.participantId))
      .where(
        and(eq(eventRegistrations.id, registrationId), eq(eventRegistrations.eventId, eventId)),
      );
    if (!row) throw new NotFoundException('Registration not found');
    const { id, status, folio, expiresAt, ...participant } = row;
    return {
      id,
      status: status as RegistrationStatus,
      folio,
      channel: expiresAt === null ? 'in_person' : 'online',
      participant,
    };
  }

  private async entitlements(
    executor: Executor,
    eventId: string,
    registrationId: string,
  ): Promise<RegistrationEntitlements> {
    const registration = await this.summary(executor, eventId, registrationId);
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
      registration,
      passes,
      accessibleActivityIds: await this.accessibleActivityIds(executor, eventId, registrationId),
    };
  }

  private async audit(
    tx: Transaction,
    actor: RegistrationAuditActor,
    registration: RegistrationRow,
    fact: {
      operationType:
        | 'pass_assignment'
        | 'pass_selection_change'
        | 'pass_removal'
        | 'registration_void'
        | 'registration_correction'
        | 'registration_discipline_swap';
      affectedActivityIds: string[];
      beforeState: Record<string, unknown>;
      afterState: Record<string, unknown>;
      facts: Record<string, unknown>;
      note?: string | null;
    },
  ) {
    await tx.insert(registrationOperationAudit).values({
      ...fact,
      ...registrationAuditActorColumns(actor),
      eventId: registration.eventId,
      registrationId: registration.id,
      participantId: registration.participantId,
    });
  }
}
