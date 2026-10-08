import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import { events } from '@/database/schema';
import type { AdminEventSales, EventSalesChanges } from './event-sales.types';
import { salesState } from './sales-state';

type Database = DatabaseService['db'];

const columns = {
  slug: events.slug,
  salesEnabled: events.salesEnabled,
  salesOpensAt: events.salesOpensAt,
  salesClosesAt: events.salesClosesAt,
};
type SalesRow = { slug: string } & EventSalesChanges;

function toEventSales(row: SalesRow, now: Date): AdminEventSales {
  return {
    slug: row.slug,
    salesEnabled: row.salesEnabled,
    salesOpensAt: row.salesOpensAt?.toISOString() ?? null,
    salesClosesAt: row.salesClosesAt?.toISOString() ?? null,
    ...salesState(row, now),
  };
}

// Sales changes are not audited yet: `event_catalog_audit` only accepts activity and pass type
// entities. See docs/contracts/event-sales.md (known gaps).
@Injectable()
export class EventSalesService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: Database) {}

  async get(eventId: string): Promise<AdminEventSales> {
    const [row] = await this.db.select(columns).from(events).where(eq(events.id, eventId));
    if (!row) throw new NotFoundException('Event not found');
    return toEventSales(row, new Date());
  }

  async update(eventId: string, changes: EventSalesChanges): Promise<AdminEventSales> {
    const [row] = await this.db
      .update(events)
      .set(changes)
      .where(eq(events.id, eventId))
      .returning(columns);
    if (!row) throw new NotFoundException('Event not found');
    return toEventSales(row, new Date());
  }
}
