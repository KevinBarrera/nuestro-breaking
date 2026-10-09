import type { CatalogActivity } from '@/entities/event-catalog';
import { describe, expect, it } from 'vitest';
import {
  accessGroups,
  accessList,
  droppedLinks,
  groupCounts,
  groupSummary,
  markAllSelectable,
  savedChoices,
  type AccessChoices,
} from './pass-access-model';

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
  activity('crews', 'battle', 'Batalla de crews', '2026-11-14T20:00:00.000Z'),
  activity('old', 'workshop', 'Taller viejo', '2026-11-14T10:00:00.000Z', 'archived'),
  activity('duo', 'battle', 'Batalla 2 vs 2', '2026-11-14T18:00:00.000Z'),
  activity('kids', 'battle', 'Batalla kids', '2026-11-14T18:00:00.000Z'),
  activity('jam', 'custom-jam', 'Jam libre', '2026-11-14T12:00:00.000Z'),
];

describe('accessGroups', () => {
  it('groups active activities by kind label, sorted by start time then name', () => {
    const groups = accessGroups(activities);
    expect(groups.map((group) => group.label)).toEqual(['Batalla', 'custom-jam', 'Taller']);
    expect(groups.map((group) => group.activities.map((entry) => entry.id))).toEqual([
      ['duo', 'kids', 'crews'],
      ['jam'],
      ['footwork'],
    ]);
  });

  it('leaves archived activities out and returns no groups when none are active', () => {
    expect(accessGroups([activities[2]])).toEqual([]);
  });
});

describe('accessList', () => {
  it('sends only granted access for active activities, in display order', () => {
    const groups = accessGroups(activities);
    const choices: AccessChoices = {
      crews: 'included',
      footwork: 'selectable',
      duo: 'none',
      old: 'included',
    };
    expect(accessList(groups, choices)).toEqual([
      { activityId: 'crews', access: 'included' },
      { activityId: 'footwork', access: 'selectable' },
    ]);
  });
});

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
    expect(droppedLinks(links, accessGroups(activities))).toBe(2);
  });
});

describe('groupCounts', () => {
  it('counts eligible and included activities in one group, unset ones as no access', () => {
    const [battles] = accessGroups(activities);
    const choices: AccessChoices = { duo: 'selectable', crews: 'included', footwork: 'included' };
    expect(groupCounts(battles, choices)).toEqual({ selectable: 1, included: 1, total: 3 });
    expect(groupCounts(battles, {})).toEqual({ selectable: 0, included: 0, total: 3 });
  });
});

describe('groupSummary', () => {
  it('reads the counts in Spanish with singular and plural forms', () => {
    expect(groupSummary({ selectable: 2, included: 0, total: 3 })).toBe(
      '2 elegibles · 0 incluidas · 3 actividades',
    );
    expect(groupSummary({ selectable: 1, included: 1, total: 1 })).toBe(
      '1 elegible · 1 incluida · 1 actividad',
    );
  });
});

describe('markAllSelectable', () => {
  it('makes every activity of the group eligible and keeps other groups as they were', () => {
    const [battles] = accessGroups(activities);
    const choices: AccessChoices = { crews: 'included', footwork: 'included' };
    expect(markAllSelectable(battles, choices)).toEqual({
      duo: 'selectable',
      kids: 'selectable',
      crews: 'selectable',
      footwork: 'included',
    });
    expect(choices).toEqual({ crews: 'included', footwork: 'included' });
  });
});
