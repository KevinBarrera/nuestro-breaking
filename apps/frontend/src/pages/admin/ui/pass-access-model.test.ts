import type { CatalogActivity } from '@/entities/event-catalog';
import { describe, expect, it } from 'vitest';
import { droppedLinks, savedChoices } from './pass-access-model';

const activity = (
  id: string,
  kind: string,
  name: string,
  startsAt: string,
  status: 'active' | 'archived' = 'active',
): CatalogActivity => ({
  id,
  eventId: 'event',
  venueId: 'venue',
  kind,
  name,
  startsAt,
  endsAt: startsAt,
  status,
  version: 1,
});

const activities = [
  activity('footwork', 'workshop', 'Taller de footwork', '2026-11-14T16:00:00.000Z'),
  activity('crews', 'competition', 'Batalla de crews', '2026-11-14T20:00:00.000Z'),
  activity('old', 'workshop', 'Taller viejo', '2026-11-14T10:00:00.000Z', 'archived'),
  activity('duo', 'competition', 'Batalla 2 vs 2', '2026-11-14T18:00:00.000Z'),
  activity('kids', 'competition', 'Batalla kids', '2026-11-14T18:00:00.000Z'),
  activity('jam', 'custom-jam', 'Jam libre', '2026-11-14T12:00:00.000Z'),
];

describe('savedChoices', () => {
  it('maps saved links by activity id', () => {
    expect(savedChoices([{ activityId: 'crews', access: 'selectable' }])).toEqual({
      crews: 'selectable',
    });
  });
});

describe('droppedLinks', () => {
  it('counts saved links whose activity is not active', () => {
    const links = [
      { activityId: 'crews', access: 'selectable' as const },
      { activityId: 'old', access: 'included' as const },
      { activityId: 'gone', access: 'included' as const },
    ];
    expect(
      droppedLinks(links, [
        { activities: activities.filter((entry) => entry.status === 'active') },
      ]),
    ).toBe(2);
  });
});
