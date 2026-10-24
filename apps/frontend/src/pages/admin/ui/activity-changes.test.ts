import type { CatalogActivity } from '@/entities/event-catalog';
import { describe, expect, it } from 'vitest';
import { activityChangeRows } from './activity-changes';

const timeZone = 'America/Mexico_City';
const venues = [
  { id: 'venue-1', name: 'Centro cultural' },
  { id: 'venue-2', name: 'Estudio principal' },
];

const activity: CatalogActivity = {
  id: 'activity-1',
  eventId: 'event-1',
  venueId: 'venue-1',
  kind: 'competition',
  name: 'Batalla de crews',
  startsAt: '2026-11-14T16:00:00.000Z',
  endsAt: '2026-11-14T18:00:00.000Z',
  status: 'active',
  version: 3,
};

const unchanged = {
  name: activity.name,
  kind: activity.kind,
  venueId: activity.venueId,
  startsAt: activity.startsAt,
  endsAt: activity.endsAt,
};

describe('activityChangeRows', () => {
  it('returns no rows for an unchanged edit', () => {
    expect(activityChangeRows(activity, unchanged, venues, timeZone)).toEqual([]);
  });

  it('lists only the changed fields with human labels and event-time values', () => {
    const rows = activityChangeRows(
      activity,
      {
        ...unchanged,
        kind: 'workshop',
        venueId: 'venue-2',
        startsAt: '2026-11-14T17:30:00.000Z',
      },
      venues,
      timeZone,
    );
    expect(rows).toEqual([
      { key: 'kind', label: 'Tipo', before: 'Competencia', after: 'Taller' },
      {
        key: 'schedule',
        label: 'Horario',
        before: 'Sáb 14 nov, 10:00–12:00',
        after: 'Sáb 14 nov, 11:30–12:00',
      },
      { key: 'venue', label: 'Sede', before: 'Centro cultural', after: 'Estudio principal' },
    ]);
  });

  it('lists a moved day as one Horario row', () => {
    const rows = activityChangeRows(
      activity,
      { ...unchanged, startsAt: '2026-11-15T16:00:00.000Z', endsAt: '2026-11-15T18:00:00.000Z' },
      venues,
      timeZone,
    );
    expect(rows).toEqual([
      {
        key: 'schedule',
        label: 'Horario',
        before: 'Sáb 14 nov, 10:00–12:00',
        after: 'Dom 15 nov, 10:00–12:00',
      },
    ]);
  });

  it('keeps an unknown kind as stored and names a venue that is no longer listed', () => {
    const rows = activityChangeRows(
      { ...activity, venueId: 'gone', kind: 'cypher' },
      { ...unchanged, kind: 'cypher' },
      venues,
      timeZone,
    );
    expect(rows).toEqual([
      { key: 'venue', label: 'Sede', before: 'Sede no disponible', after: 'Centro cultural' },
    ]);
  });
});
