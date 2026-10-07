import type { CatalogActivity } from '@/entities/event-catalog';
import { describe, expect, it } from 'vitest';
import {
  agendaDays,
  countVisible,
  formatTimeRange,
  kindOptions,
  type AgendaFilters,
} from './activity-agenda-model';

// Mexico City is UTC-6 in November. The event time zone is always passed explicitly, so results
// never depend on the machine time zone.
const timeZone = 'America/Mexico_City';

const activity = (overrides: Partial<CatalogActivity> & Pick<CatalogActivity, 'id'>) => ({
  eventId: 'event',
  venueId: 'venue',
  kind: 'battle',
  name: 'Actividad',
  startsAt: '2026-11-21T22:00:00.000Z',
  endsAt: '2026-11-22T00:00:00.000Z',
  status: 'active' as const,
  version: 1,
  ...overrides,
});

// The list order is deliberately not chronological.
const crews = activity({
  id: 'crews',
  kind: 'battle',
  name: 'Batalla de crews',
  startsAt: '2026-11-21T22:00:00.000Z', // Saturday 16:00 local
  endsAt: '2026-11-22T00:00:00.000Z',
});
const nightly = activity({
  // UTC says Sunday 22; the event's own clock says Saturday 21 at 22:30.
  id: 'nightly',
  kind: 'social',
  name: 'Cypher nocturno',
  startsAt: '2026-11-22T04:30:00.000Z',
  endsAt: '2026-11-22T06:00:00.000Z',
});
const bgirl = activity({
  id: 'bgirl',
  kind: 'competition',
  name: 'Bgirl 1v1',
  startsAt: '2026-11-21T16:00:00.000Z', // Saturday 10:00 local
  endsAt: '2026-11-21T18:00:00.000Z',
});
const finale = activity({
  id: 'finale',
  kind: 'battle',
  name: 'Exhibición final',
  startsAt: '2026-11-22T20:00:00.000Z', // Sunday 14:00 local
  endsAt: '2026-11-22T21:00:00.000Z',
});
const cancelled = activity({
  id: 'cancelled',
  kind: 'social',
  name: 'Cypher cancelado',
  startsAt: '2026-11-22T18:00:00.000Z', // Sunday 12:00 local
  endsAt: '2026-11-22T19:00:00.000Z',
  status: 'archived',
});
const activities = [crews, nightly, bgirl, finale, cancelled];

const allFilters: AgendaFilters = { kind: null, query: '', showArchived: false };
const names = (filters: Partial<AgendaFilters>, rows: CatalogActivity[] = activities) =>
  agendaDays(rows, { ...allFilters, ...filters }, timeZone).map((day) => [
    day.label,
    day.activities.map((entry) => entry.name),
  ]);

describe('agendaDays', () => {
  it('groups active activities by day on the event clock, in start-time order', () => {
    expect(agendaDays(activities, allFilters, timeZone).map((day) => day.key)).toEqual([
      '2026-11-21',
      '2026-11-22',
    ]);
    expect(names({})).toEqual([
      ['Sábado 21 de noviembre', ['Bgirl 1v1', 'Batalla de crews', 'Cypher nocturno']],
      ['Domingo 22 de noviembre', ['Exhibición final']],
    ]);
  });

  it('orders activities that start together by name', () => {
    const same = { startsAt: crews.startsAt, endsAt: crews.endsAt };
    const rows = [
      activity({ id: 'z', name: 'Zulu', ...same }),
      activity({ id: 'a', name: 'Alfa', ...same }),
    ];
    expect(names({}, rows)).toEqual([['Sábado 21 de noviembre', ['Alfa', 'Zulu']]]);
  });

  it('shows archived activities only when asked', () => {
    expect(names({ showArchived: true })).toEqual([
      ['Sábado 21 de noviembre', ['Bgirl 1v1', 'Batalla de crews', 'Cypher nocturno']],
      ['Domingo 22 de noviembre', ['Cypher cancelado', 'Exhibición final']],
    ]);
  });

  it('filters by kind', () => {
    expect(names({ kind: 'battle' })).toEqual([
      ['Sábado 21 de noviembre', ['Batalla de crews']],
      ['Domingo 22 de noviembre', ['Exhibición final']],
    ]);
  });

  it.each(['EXHIBICION', 'exhibición', '  Exhib  '])(
    'searches names ignoring case, accents and surrounding spaces (%j)',
    (query) => {
      expect(names({ query })).toEqual([['Domingo 22 de noviembre', ['Exhibición final']]]);
    },
  );

  it('combines kind, search and archived filters', () => {
    expect(names({ kind: 'social', query: 'cypher' })).toEqual([
      ['Sábado 21 de noviembre', ['Cypher nocturno']],
    ]);
    expect(names({ kind: 'social', query: 'cypher', showArchived: true })).toEqual([
      ['Sábado 21 de noviembre', ['Cypher nocturno']],
      ['Domingo 22 de noviembre', ['Cypher cancelado']],
    ]);
  });

  it('returns no days when nothing matches', () => {
    expect(agendaDays(activities, { ...allFilters, query: 'no existe' }, timeZone)).toEqual([]);
  });
});

describe('kindOptions', () => {
  const options = (showArchived: boolean, selected: string | null, rows = activities) =>
    kindOptions(rows, showArchived, selected).map(({ label, count }) => `${label} · ${count}`);

  it('counts the visible kinds, sorted by Spanish label, with workshops always listed', () => {
    expect(options(false, null)).toEqual([
      'Batalla · 2',
      'Competencia · 1',
      'Social · 1',
      'Taller · 0',
    ]);
  });

  it('counts archived activities only when they are shown', () => {
    expect(options(true, null)).toContain('Social · 2');
  });

  it('keeps the selected kind with a zero count when none of it is visible', () => {
    const archivedBgirl = activities.map((entry) =>
      entry === bgirl ? { ...entry, status: 'archived' as const } : entry,
    );
    expect(options(false, null, archivedBgirl)).not.toContain('Competencia · 0');
    expect(options(false, 'competition', archivedBgirl)).toContain('Competencia · 0');
    expect(options(true, 'competition', archivedBgirl)).toContain('Competencia · 1');
  });

  it('labels an unknown kind as stored', () => {
    expect(options(false, null, [activity({ id: 'x', kind: 'cypher' })])).toEqual([
      'cypher · 1',
      'Taller · 0',
    ]);
  });
});

describe('countVisible', () => {
  it('counts active activities, plus archived ones when shown', () => {
    expect(countVisible(activities, false)).toBe(4);
    expect(countVisible(activities, true)).toBe(5);
  });
});

describe('formatTimeRange', () => {
  it('shows the start and end on the event clock', () => {
    expect(formatTimeRange(bgirl, timeZone)).toBe('10:00–12:00');
    expect(formatTimeRange(crews, timeZone)).toBe('16:00–18:00');
  });

  it('marks an end on a later event day', () => {
    expect(formatTimeRange(nightly, timeZone)).toBe('22:30–00:00 (+1 día)');
    const twoDays = activity({ id: 'long', endsAt: '2026-11-24T00:00:00.000Z' });
    expect(formatTimeRange(twoDays, timeZone)).toBe('16:00–18:00 (+2 días)');
  });
});
