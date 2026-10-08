import { Inject, Injectable } from '@nestjs/common';
import { asc, inArray } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import { events } from '@/database/schema';
import type { DatabaseService } from '@/database/database.service';

@Injectable()
export class CheckInEventListService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: DatabaseService['db']) {}

  async list(scope: string[] | null) {
    if (scope !== null && scope.length === 0) return [];
    return this.db
      .select({ id: events.id, name: events.name })
      .from(events)
      .where(scope === null ? undefined : inArray(events.id, scope))
      .orderBy(asc(events.name), asc(events.id));
  }
}
