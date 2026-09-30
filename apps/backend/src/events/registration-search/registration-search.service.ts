import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, ilike, inArray, or } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import { type DatabaseService } from '@/database/database.service';
import {
  activities,
  eventActivityRegistrations,
  eventRegistrations,
  participants,
} from '@/database/schema';
import { type RegistrationSearchPage } from './registration-search.types';

@Injectable()
export class RegistrationSearchService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: DatabaseService['db']) {}

  async search(
    eventId: string,
    q: string,
    limit: number,
    offset: number,
  ): Promise<RegistrationSearchPage> {
    // Treat SQL LIKE metacharacters as literal user input, not roster-wide wildcards.
    const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const matches = and(
      eq(eventRegistrations.eventId, eventId),
      or(
        ilike(participants.fullName, pattern),
        ilike(participants.email, pattern),
        ilike(participants.stageName, pattern),
        ilike(eventRegistrations.folio, pattern),
      ),
    );
    const [totals, rows] = await Promise.all([
      this.db
        .select({ total: count() })
        .from(eventRegistrations)
        .innerJoin(participants, eq(eventRegistrations.participantId, participants.id))
        .where(matches),
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
        })
        .from(eventRegistrations)
        .innerJoin(participants, eq(eventRegistrations.participantId, participants.id))
        .where(matches)
        .orderBy(
          asc(participants.fullName),
          asc(eventRegistrations.folio),
          asc(eventRegistrations.id),
        )
        .limit(limit)
        .offset(offset),
    ]);

    const activityRows = rows.length
      ? await this.db
          .select({
            registrationId: eventActivityRegistrations.eventRegistrationId,
            id: activities.id,
            name: activities.name,
            kind: activities.kind,
          })
          .from(eventActivityRegistrations)
          .innerJoin(
            activities,
            and(
              eq(activities.id, eventActivityRegistrations.activityId),
              eq(activities.eventId, eventActivityRegistrations.eventId),
            ),
          )
          .where(
            and(
              eq(eventActivityRegistrations.eventId, eventId),
              inArray(
                eventActivityRegistrations.eventRegistrationId,
                rows.map((row) => row.registrationId),
              ),
            ),
          )
          .orderBy(asc(activities.id))
      : [];

    return {
      total: totals[0].total,
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
        },
        activities: activityRows
          .filter((activity) => activity.registrationId === row.registrationId)
          .map(({ id, name, kind }) => ({ id, name, kind })),
      })),
    };
  }
}
