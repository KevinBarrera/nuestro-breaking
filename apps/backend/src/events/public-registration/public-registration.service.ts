import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, ne, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import {
  eventPassTypes,
  eventRegistrationPassSelections,
  eventRegistrationPasses,
  eventRegistrations,
  participants,
  registrationOperationAudit,
} from '@/database/schema';
import type { PassClass, RequiredPassClass } from '@/events/pass-type-admin/pass-type-admin.types';
import {
  buildFullName,
  phoneMatchKey,
} from '@/events/participant-profile/participant-normalization';
import { registrationAuditActorColumns } from '@/events/registration-audit/registration-audit-actor';
import { areSelectableActivities } from '@/events/registration-entitlements/selectable-activities';
import { passRuleViolation, type RuleViolation } from './public-registration-rules';
import type {
  PublicRegistrationBuyer,
  PublicRegistrationPass,
  PublicRegistrationRequest,
  PublicRegistrationResult,
} from './public-registration.types';

type Database = DatabaseService['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type HeldPass = { registrationPassId: string; passTypeId: string; priceCents: number };

/** 409 for a catalog or duplicate rule: `{ statusCode, code, message }`, never buyer data. */
export class PublicRegistrationRuleException extends ConflictException {
  constructor(violation: Pick<RuleViolation, 'code' | 'message'>) {
    super({ statusCode: 409, code: violation.code, message: violation.message });
  }
}

// Neutral answer for a buyer that already holds a confirmed registration (D5): it says nothing
// about the existing record, so an email or phone cannot be probed through this endpoint.
const REGISTRATION_UNAVAILABLE = {
  code: 'registration_unavailable',
  message: 'This registration cannot be completed online. Please contact the organizer.',
} as const;

// SQL twin of `phoneMatchKey` for stored phones, which are kept as entered.
function phoneMatchKeySql(column: AnyPgColumn): SQL {
  const digits = sql`regexp_replace(coalesce(${column}, ''), '[^0-9]', '', 'g')`;
  return sql`(CASE
    WHEN ${digits} ~ '^521[0-9]{10}$' THEN substr(${digits}, 4)
    WHEN ${digits} ~ '^52[0-9]{10}$' THEN substr(${digits}, 3)
    ELSE ${digits} END)`;
}

const profile = (buyer: PublicRegistrationBuyer) => ({
  fullName: buildFullName(buyer.firstName, buyer.firstLastName, buyer.secondLastName),
  firstName: buyer.firstName,
  firstLastName: buyer.firstLastName,
  secondLastName: buyer.secondLastName,
  stageName: buyer.stageName,
  email: buyer.email,
  phone: buyer.phone,
  city: buyer.city,
  instagram: buyer.instagram,
  level: buyer.level,
  birthDate: buyer.birthDate,
});

@Injectable()
export class PublicRegistrationService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: Database) {}

  /**
   * Creates (or reuses, D5) the buyer's `pending_payment` registration with its passes and
   * selections, in one transaction with its `online_registration` audit fact. The caller has
   * already checked that sales are open. Legal acceptance (#180) will be stored here too.
   */
  async register(
    eventId: string,
    request: PublicRegistrationRequest,
  ): Promise<PublicRegistrationResult> {
    return this.db.transaction(async (tx) => {
      // Same per-event lock as admin manual registration: creations and duplicate checks for one
      // event run one at a time, whichever path they come from.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`);
      const passTypes = await this.lockPassTypes(tx, eventId, request);
      const passIds = request.passes.map((pass) => pass.passTypeId);
      const violation = passRuleViolation(passIds, passTypes);
      if (violation) throw new PublicRegistrationRuleException(violation);
      for (const pass of request.passes)
        if (
          !(await areSelectableActivities(tx, eventId, pass.passTypeId, pass.selectedActivityIds))
        )
          throw new PublicRegistrationRuleException({
            code: 'selection_unavailable',
            message: 'Invalid activity selection',
          });

      const reusable = await this.reusablePending(tx, eventId, request.buyer);
      let registration: { id: string; participantId: string };
      let previous: HeldPass[] = [];
      if (reusable) {
        registration = reusable;
        previous = await this.heldPasses(tx, eventId, registration.id);
        await tx
          .update(participants)
          .set({ ...profile(request.buyer), updatedAt: new Date() })
          .where(eq(participants.id, registration.participantId));
        await this.removePasses(tx, eventId, previous);
        await tx
          .update(eventRegistrations)
          .set({ updatedAt: new Date() })
          .where(eq(eventRegistrations.id, registration.id));
      } else {
        const [participant] = await tx
          .insert(participants)
          .values(profile(request.buyer))
          .returning({ id: participants.id });
        const [created] = await tx
          .insert(eventRegistrations)
          .values({ eventId, participantId: participant.id })
          .returning({ id: eventRegistrations.id });
        registration = { id: created.id, participantId: participant.id };
      }

      const passes: PublicRegistrationPass[] = [];
      const registrationPassIds: string[] = [];
      for (const pass of request.passes) {
        const passType = passTypes.get(pass.passTypeId)!;
        const [held] = await tx
          .insert(eventRegistrationPasses)
          .values({
            eventId,
            eventRegistrationId: registration.id,
            passTypeId: pass.passTypeId,
            priceCents: passType.priceCents,
          })
          .returning({ id: eventRegistrationPasses.id });
        if (pass.selectedActivityIds.length > 0)
          await tx.insert(eventRegistrationPassSelections).values(
            pass.selectedActivityIds.map((activityId) => ({
              eventId,
              registrationPassId: held.id,
              activityId,
            })),
          );
        registrationPassIds.push(held.id);
        passes.push({
          passTypeId: pass.passTypeId,
          name: passType.name,
          passClass: passType.passClass,
          priceCents: passType.priceCents,
          selectedActivityIds: pass.selectedActivityIds,
        });
      }

      // Ids, prices and selections only (audit policy): no name, email or phone.
      const selected = passes.flatMap((pass) => pass.selectedActivityIds);
      await tx.insert(registrationOperationAudit).values({
        operationType: 'online_registration',
        ...registrationAuditActorColumns({ kind: 'public' }),
        eventId,
        registrationId: registration.id,
        participantId: registration.participantId,
        affectedActivityIds: [...new Set(selected)],
        beforeState: reusable
          ? { status: 'pending_payment', passes: previous }
          : { registration: null },
        afterState: {
          status: 'pending_payment',
          participantId: registration.participantId,
          passes: passes.map((pass, index) => ({
            registrationPassId: registrationPassIds[index],
            passTypeId: pass.passTypeId,
            priceCents: pass.priceCents,
            selections: pass.selectedActivityIds,
          })),
        },
        facts: { participantCreated: !reusable, registrationReused: !!reusable },
      });

      return {
        registrationId: registration.id,
        status: 'pending_payment',
        passes,
        totalCents: passes.reduce((total, pass) => total + pass.priceCents, 0),
      };
    });
  }

  // Share lock keeps a concurrent archive or price edit from interleaving with the price snapshot.
  private async lockPassTypes(
    tx: Transaction,
    eventId: string,
    request: PublicRegistrationRequest,
  ) {
    const rows = await tx
      .select({
        id: eventPassTypes.id,
        name: eventPassTypes.name,
        passClass: eventPassTypes.passClass,
        requiresPassClass: eventPassTypes.requiresPassClass,
        priceCents: eventPassTypes.priceCents,
        status: eventPassTypes.status,
      })
      .from(eventPassTypes)
      .where(
        and(
          eq(eventPassTypes.eventId, eventId),
          inArray(
            eventPassTypes.id,
            request.passes.map((pass) => pass.passTypeId),
          ),
        ),
      )
      .for('share');
    return new Map(
      rows.map((row) => [
        row.id,
        {
          ...row,
          passClass: row.passClass as PassClass,
          requiresPassClass: row.requiresPassClass as RequiredPassClass | null,
        },
      ]),
    );
  }

  /**
   * D5 duplicates within the event, by normalized email or phone match key. Any confirmed match
   * rejects the request neutrally; voided registrations never count. Otherwise the pending match
   * (email first, then the oldest) is locked and returned for reuse, or null.
   */
  private async reusablePending(
    tx: Transaction,
    eventId: string,
    buyer: PublicRegistrationBuyer,
  ): Promise<{ id: string; participantId: string } | null> {
    const emailMatch = sql<boolean>`lower(btrim(${participants.email})) = ${buyer.email}::text`;
    const matches = await tx
      .select({
        id: eventRegistrations.id,
        participantId: eventRegistrations.participantId,
        status: eventRegistrations.status,
        byEmail: emailMatch,
      })
      .from(eventRegistrations)
      .innerJoin(participants, eq(participants.id, eventRegistrations.participantId))
      .where(
        and(
          eq(eventRegistrations.eventId, eventId),
          ne(eventRegistrations.status, 'voided'),
          or(
            emailMatch,
            sql`${phoneMatchKeySql(participants.phone)} = ${phoneMatchKey(buyer.phone)}`,
          ),
        ),
      )
      .orderBy(asc(eventRegistrations.createdAt), asc(eventRegistrations.id));
    if (matches.some((match) => match.status === 'confirmed'))
      throw new PublicRegistrationRuleException(REGISTRATION_UNAVAILABLE);
    const pending = matches.find((match) => match.byEmail) ?? matches[0];
    if (!pending) return null;
    // Row lock, as admin entitlement writes take, so pass replacement cannot interleave with them.
    const [locked] = await tx
      .select({ status: eventRegistrations.status })
      .from(eventRegistrations)
      .where(eq(eventRegistrations.id, pending.id))
      .for('update');
    if (locked?.status !== 'pending_payment')
      throw new PublicRegistrationRuleException(REGISTRATION_UNAVAILABLE);
    return { id: pending.id, participantId: pending.participantId };
  }

  private async heldPasses(
    tx: Transaction,
    eventId: string,
    registrationId: string,
  ): Promise<(HeldPass & { selections: string[] })[]> {
    const rows = await tx
      .select({
        registrationPassId: eventRegistrationPasses.id,
        passTypeId: eventRegistrationPasses.passTypeId,
        priceCents: eventRegistrationPasses.priceCents,
      })
      .from(eventRegistrationPasses)
      .where(
        and(
          eq(eventRegistrationPasses.eventId, eventId),
          eq(eventRegistrationPasses.eventRegistrationId, registrationId),
        ),
      )
      .orderBy(asc(eventRegistrationPasses.createdAt), asc(eventRegistrationPasses.id));
    const chosen =
      rows.length === 0
        ? []
        : await tx
            .select({
              registrationPassId: eventRegistrationPassSelections.registrationPassId,
              activityId: eventRegistrationPassSelections.activityId,
            })
            .from(eventRegistrationPassSelections)
            .where(
              and(
                eq(eventRegistrationPassSelections.eventId, eventId),
                inArray(
                  eventRegistrationPassSelections.registrationPassId,
                  rows.map((row) => row.registrationPassId),
                ),
              ),
            );
    return rows.map((row) => ({
      ...row,
      selections: chosen
        .filter((choice) => choice.registrationPassId === row.registrationPassId)
        .map((choice) => choice.activityId)
        .sort(),
    }));
  }

  private async removePasses(tx: Transaction, eventId: string, held: HeldPass[]) {
    if (held.length === 0) return;
    const ids = held.map((pass) => pass.registrationPassId);
    await tx
      .delete(eventRegistrationPassSelections)
      .where(
        and(
          eq(eventRegistrationPassSelections.eventId, eventId),
          inArray(eventRegistrationPassSelections.registrationPassId, ids),
        ),
      );
    await tx
      .delete(eventRegistrationPasses)
      .where(
        and(eq(eventRegistrationPasses.eventId, eventId), inArray(eventRegistrationPasses.id, ids)),
      );
  }
}
