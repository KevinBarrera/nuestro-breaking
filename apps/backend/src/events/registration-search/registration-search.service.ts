import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, exists, ilike, inArray, or, type SQL } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import { type DatabaseService } from '@/database/database.service';
import {
  activities,
  activityCheckIns,
  eventCashPayments,
  eventCheckIns,
  eventPassTypes,
  eventRegistrationPasses,
  eventRegistrations,
  participants,
} from '@/database/schema';
import type { PassClass } from '@/events/pass-type-admin/pass-type-admin.types';
import { holdsGeneralEntryOnly } from '@/events/registration-entitlements/pass-class-rules';
import { RegistrationEntitlementsService } from '@/events/registration-entitlements/registration-entitlements.service';
import { CHECK_IN_KINDS } from '@/events/shared/check-in-kinds';
import {
  isRegistrationStatus,
  type RegistrationSearchFilter,
  type RegistrationSearchPage,
  type RegistrationSearchResult,
  type RegistrationStatusCounts,
} from './registration-search.types';

@Injectable()
export class RegistrationSearchService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: DatabaseService['db'],
    private readonly entitlements: RegistrationEntitlementsService,
  ) {}

  async search(
    eventId: string,
    { q, status }: RegistrationSearchFilter,
    limit: number,
    offset: number,
  ): Promise<RegistrationSearchPage> {
    const matchesQuery = and(
      eq(eventRegistrations.eventId, eventId),
      q ? this.queryMatch(q) : undefined,
    );
    const matches = status
      ? and(matchesQuery, eq(eventRegistrations.status, status))
      : matchesQuery;
    const [totals, byStatus, rows] = await Promise.all([
      this.db
        .select({ total: count() })
        .from(eventRegistrations)
        .innerJoin(participants, eq(eventRegistrations.participantId, participants.id))
        .where(matches),
      this.db
        .select({ status: eventRegistrations.status, total: count() })
        .from(eventRegistrations)
        .innerJoin(participants, eq(eventRegistrations.participantId, participants.id))
        .where(matchesQuery)
        .groupBy(eventRegistrations.status),
      this.db
        .select({
          participantId: participants.id,
          fullName: participants.fullName,
          email: participants.email,
          stageName: participants.stageName,
          registrationId: eventRegistrations.id,
          eventId: eventRegistrations.eventId,
          folio: eventRegistrations.folio,
          status: eventRegistrations.status,
          checkedInAt: eventCheckIns.checkedInAt,
        })
        .from(eventRegistrations)
        .innerJoin(participants, eq(eventRegistrations.participantId, participants.id))
        .leftJoin(
          eventCheckIns,
          and(
            eq(eventCheckIns.eventId, eventRegistrations.eventId),
            eq(eventCheckIns.eventRegistrationId, eventRegistrations.id),
          ),
        )
        .where(matches)
        .orderBy(
          asc(participants.fullName),
          asc(eventRegistrations.folio),
          asc(eventRegistrations.id),
        )
        .limit(limit)
        .offset(offset),
    ]);

    const registrationIds = rows.map((row) => row.registrationId);
    const [accessible, heldClasses, heldPasses] = await Promise.all([
      this.entitlements.accessibleActivityIdsByRegistration(this.db, eventId, registrationIds),
      this.entitlements.heldPassClassesByRegistration(this.db, eventId, registrationIds),
      this.heldPassesByRegistration(eventId, registrationIds),
    ]);
    const activityIds = [...new Set([...accessible.values()].flat())];
    const [catalog, checkIns] = activityIds.length
      ? await Promise.all([
          this.db
            .select({ id: activities.id, name: activities.name, kind: activities.kind })
            .from(activities)
            .where(
              and(
                eq(activities.eventId, eventId),
                inArray(activities.id, activityIds),
                inArray(activities.kind, CHECK_IN_KINDS),
              ),
            ),
          this.db
            .select({
              registrationId: activityCheckIns.eventRegistrationId,
              activityId: activityCheckIns.activityId,
              checkedInAt: activityCheckIns.checkedInAt,
            })
            .from(activityCheckIns)
            .where(
              and(
                eq(activityCheckIns.eventId, eventId),
                inArray(activityCheckIns.eventRegistrationId, registrationIds),
                inArray(activityCheckIns.activityId, activityIds),
              ),
            ),
        ])
      : [[], []];
    const eligible = new Map(catalog.map((activity) => [activity.id, activity]));
    const checkedIn = new Map(
      checkIns.map((fact) => [`${fact.registrationId}:${fact.activityId}`, fact.checkedInAt]),
    );

    const counts: RegistrationStatusCounts = {
      all: 0,
      pending_payment: 0,
      confirmed: 0,
      voided: 0,
    };
    for (const row of byStatus) {
      counts.all += row.total;
      if (isRegistrationStatus(row.status)) counts[row.status] = row.total;
    }

    return {
      total: totals[0].total,
      counts,
      limit,
      offset,
      results: rows.map((row) => ({
        participant: {
          id: row.participantId,
          fullName: row.fullName,
          email: row.email,
          stageName: row.stageName,
        },
        registration: {
          id: row.registrationId,
          eventId: row.eventId,
          folio: row.folio,
          status: row.status,
          checkedInAt: row.checkedInAt?.toISOString() ?? null,
          generalEntryOnly: holdsGeneralEntryOnly(heldClasses.get(row.registrationId) ?? []),
        },
        passes: heldPasses.get(row.registrationId) ?? [],
        // Already sorted by id; activities that are not check-in eligible drop out.
        activities: (accessible.get(row.registrationId) ?? []).flatMap((activityId) => {
          const activity = eligible.get(activityId);
          if (!activity) return [];
          const checkedInAt = checkedIn.get(`${row.registrationId}:${activityId}`);
          return [{ ...activity, checkedInAt: checkedInAt?.toISOString() ?? null }];
        }),
      })),
    };
  }

  // Name, email or AKA, folio or the current cash receipt number containing `q` (#125, #104).
  private queryMatch(q: string): SQL | undefined {
    // Treat SQL LIKE metacharacters as literal user input, not roster-wide wildcards.
    const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    return or(
      ilike(participants.fullName, pattern),
      ilike(participants.email, pattern),
      ilike(participants.stageName, pattern),
      ilike(eventRegistrations.folio, pattern),
      // The current paper receipt number of the registration's cash payment (#125, #104).
      exists(
        this.db
          .select({ id: eventCashPayments.id })
          .from(eventCashPayments)
          .where(
            and(
              eq(eventCashPayments.eventId, eventRegistrations.eventId),
              eq(eventCashPayments.eventRegistrationId, eventRegistrations.id),
              ilike(eventCashPayments.receipt, pattern),
            ),
          ),
      ),
    );
  }

  // Held passes per registration for the list rows, archived pass types included (what was
  // bought), sorted by name.
  private async heldPassesByRegistration(
    eventId: string,
    registrationIds: readonly string[],
  ): Promise<Map<string, RegistrationSearchResult['passes']>> {
    const result = new Map(
      registrationIds.map((id) => [id, [] as RegistrationSearchResult['passes']]),
    );
    if (registrationIds.length === 0) return result;
    const rows = await this.db
      .select({
        registrationId: eventRegistrationPasses.eventRegistrationId,
        name: eventPassTypes.name,
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
      )
      .orderBy(asc(eventPassTypes.name), asc(eventRegistrationPasses.id));
    for (const row of rows)
      result
        .get(row.registrationId)
        ?.push({ name: row.name, passClass: row.passClass as PassClass });
    return result;
  }
}
