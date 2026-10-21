import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import { type DatabaseService } from '@/database/database.service';
import {
  activities,
  activityCheckIns,
  eventCheckIns,
  eventPassTypes,
  eventRegistrationPasses,
  eventRegistrations,
  events,
  participants,
} from '@/database/schema';
import type { PassClass } from '@/events/pass-type-admin/pass-type-admin.types';
import { RegistrationEntitlementsService } from '@/events/registration-entitlements/registration-entitlements.service';
import { CHECK_IN_KINDS } from '@/events/shared/check-in-kinds';
import { orderPassTypes } from './attendee-lists.ordering';
import type { AttendeeLists } from './attendee-lists.types';

// Voided registrations stay off paper so a printed row never suggests admitting one.
const LISTED_STATUSES = ['confirmed', 'pending_payment'];

@Injectable()
export class AttendeeListsService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: DatabaseService['db'],
    private readonly entitlements: RegistrationEntitlementsService,
  ) {}

  /**
   * A fixed number of queries regardless of the attendee count. Columns are selected one by one:
   * participant contact fields (email, phone, Instagram, birth date) never leave the database.
   */
  async read(eventId: string): Promise<AttendeeLists> {
    const [event] = await this.db
      .select({ id: events.id, name: events.name })
      .from(events)
      .where(eq(events.id, eventId));
    if (!event) throw new NotFoundException('Event not found');
    const generatedAt = new Date().toISOString();

    const rows = await this.db
      .select({
        registrationId: eventRegistrations.id,
        folio: eventRegistrations.folio,
        fullName: participants.fullName,
        stageName: participants.stageName,
        status: eventRegistrations.status,
        eventCheckedInAt: eventCheckIns.checkedInAt,
      })
      .from(eventRegistrations)
      .innerJoin(participants, eq(participants.id, eventRegistrations.participantId))
      .leftJoin(
        eventCheckIns,
        and(
          eq(eventCheckIns.eventId, eventRegistrations.eventId),
          eq(eventCheckIns.eventRegistrationId, eventRegistrations.id),
        ),
      )
      .where(
        and(
          eq(eventRegistrations.eventId, eventId),
          inArray(eventRegistrations.status, LISTED_STATUSES),
        ),
      )
      .orderBy(asc(sql`lower(${participants.fullName})`), asc(eventRegistrations.id));
    const registrationIds = rows.map((row) => row.registrationId);

    const [held, accessible] = await Promise.all([
      this.heldPassTypes(eventId, registrationIds),
      this.entitlements.accessibleActivityIdsByRegistration(this.db, eventId, registrationIds),
    ]);
    const accessibleIds = [...new Set([...accessible.values()].flat())];
    const [catalog, checkIns] = accessibleIds.length
      ? await Promise.all([
          this.db
            .select({
              id: activities.id,
              name: activities.name,
              kind: activities.kind,
              startsAt: activities.startsAt,
            })
            .from(activities)
            .where(
              and(
                eq(activities.eventId, eventId),
                inArray(activities.id, accessibleIds),
                inArray(activities.kind, CHECK_IN_KINDS),
              ),
            )
            .orderBy(asc(activities.startsAt), asc(activities.name), asc(activities.id)),
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
                inArray(activityCheckIns.activityId, accessibleIds),
              ),
            ),
        ])
      : [[], []];

    const passTypes = orderPassTypes(
      held.map(({ id, name, passClass, status }) => ({
        id,
        name,
        passClass: passClass as PassClass,
        status,
      })),
    );
    const heldBy = new Set(held.map((row) => `${row.registrationId}:${row.id}`));
    const checkedIn = new Map(
      checkIns.map((fact) => [`${fact.registrationId}:${fact.activityId}`, fact.checkedInAt]),
    );

    return {
      event,
      generatedAt,
      passTypes,
      activities: catalog.map((activity) => ({
        ...activity,
        startsAt: activity.startsAt.toISOString(),
      })),
      registrations: rows.map((row) => {
        const access = new Set(accessible.get(row.registrationId));
        return {
          registrationId: row.registrationId,
          folio: row.folio,
          fullName: row.fullName,
          stageName: row.stageName,
          status: row.status,
          eventCheckedInAt: row.eventCheckedInAt?.toISOString() ?? null,
          passTypeIds: passTypes
            .filter((passType) => heldBy.has(`${row.registrationId}:${passType.id}`))
            .map((passType) => passType.id),
          activities: catalog
            .filter((activity) => access.has(activity.id))
            .map((activity) => ({
              activityId: activity.id,
              checkedInAt:
                checkedIn.get(`${row.registrationId}:${activity.id}`)?.toISOString() ?? null,
            })),
        };
      }),
    };
  }

  // Held pass types per registration, archived ones included (what was bought).
  private async heldPassTypes(eventId: string, registrationIds: string[]) {
    if (registrationIds.length === 0) return [];
    return this.db
      .select({
        registrationId: eventRegistrationPasses.eventRegistrationId,
        id: eventPassTypes.id,
        name: eventPassTypes.name,
        passClass: eventPassTypes.passClass,
        status: eventPassTypes.status,
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
          inArray(eventRegistrationPasses.eventRegistrationId, registrationIds),
        ),
      );
  }
}
