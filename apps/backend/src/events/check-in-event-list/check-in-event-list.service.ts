import { Inject, Injectable } from '@nestjs/common';
import { and, asc, inArray, isNull } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import { events } from '@/database/schema';
import type { DatabaseService } from '@/database/database.service';
import {
  type AdminEventSummary,
  adminEventSummaryColumns,
  toAdminEventSummary,
} from '@/events/admin-events/admin-event.read-model';

@Injectable()
export class CheckInEventListService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: DatabaseService['db']) {}

  /** `scope` is `null` for global admins. Archived events are left out unless asked for (#213). */
  async list(scope: string[] | null, includeArchived = false): Promise<AdminEventSummary[]> {
    if (scope !== null && scope.length === 0) return [];
    const rows = await this.db
      .select(adminEventSummaryColumns)
      .from(events)
      .where(
        and(
          scope === null ? undefined : inArray(events.id, scope),
          includeArchived ? undefined : isNull(events.archivedAt),
        ),
      )
      .orderBy(asc(events.name), asc(events.id));
    return rows.map(toAdminEventSummary);
  }
}
