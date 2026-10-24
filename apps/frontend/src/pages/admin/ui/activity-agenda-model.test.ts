import type { AttendeeLists } from '@/entities/attendee-list';
import type { CatalogActivity, CatalogPassType } from '@/entities/event-catalog';
import { describe, expect, it } from 'vitest';
import {
  agendaDays,
  agendaFooter,
  enrolledCount,
  enrolledLabel,
  enrollmentCounts,
  formatTimeRange,
  kindOptions,
  overlapping,
  passNames,
  tabCounts,
  type AgendaFilters,
} from './activity-agenda-model';

// Mexico City is UTC-6 in November. The event time zone is always passed explicitly, so results
// never depend on the machine time zone.
const timeZone = 'America/Mexico_City';

const activity = (overrides: Partial<CatalogActivity> & Pick<CatalogActivity, 'id'>) => ({
  eventId: 'event',
  venueId: 'venue',
  kind: 'competition',
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
  kind: 'competition',
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
  kind: 'competition',
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

const allFilters: AgendaFilters = { tab: 'active', kind: null, query: '' };
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

  it('shows only archived activities on the Archivadas tab', () => {
    expect(names({ tab: 'archived' })).toEqual([['Domingo 22 de noviembre', ['Cypher cancelado']]]);
  });

  it('filters by kind', () => {
    expect(names({ kind: 'competition' })).toEqual([
      ['Sábado 21 de noviembre', ['Bgirl 1v1', 'Batalla de crews']],
      ['Domingo 22 de noviembre', ['Exhibición final']],
    ]);
  });

  it.each(['EXHIBICION', 'exhibición', '  Exhib  '])(
    'searches names ignoring case, accents and surrounding spaces (%j)',
    (query) => {
      expect(names({ query })).toEqual([['Domingo 22 de noviembre', ['Exhibición final']]]);
    },
  );

  it('combines tab, kind and search', () => {
    expect(names({ kind: 'social', query: 'cypher' })).toEqual([
      ['Sábado 21 de noviembre', ['Cypher nocturno']],
    ]);
    expect(names({ tab: 'archived', kind: 'social', query: 'cypher' })).toEqual([
      ['Domingo 22 de noviembre', ['Cypher cancelado']],
    ]);
  });

  it('returns no days when nothing matches', () => {
    expect(agendaDays(activities, { ...allFilters, query: 'no existe' }, timeZone)).toEqual([]);
  });
});

describe('tabCounts', () => {
  it('counts active and archived activities', () => {
    expect(tabCounts(activities)).toEqual({ active: 4, archived: 1 });
    expect(tabCounts([])).toEqual({ active: 0, archived: 0 });
  });
});

describe('kindOptions', () => {
  const options = (tab: AgendaFilters['tab'], selected: string | null, rows = activities) =>
    kindOptions(rows, tab, selected).map(({ label, count }) => `${label} · ${count}`);

  it('lists Todas and the kinds present in the tab, in the catalog order', () => {
    expect(options('active', null)).toEqual(['Todas · 4', 'Competencias · 3', 'Sociales · 1']);
    expect(options('archived', null)).toEqual(['Todas · 1', 'Sociales · 1']);
  });

  it('never lists a kind with no activities in the tab', () => {
    expect(options('active', null)).not.toContain('Talleres · 0');
  });

  it('keeps the selected kind with a zero count so the pressed chip explains the filter', () => {
    expect(options('archived', 'competition')).toEqual([
      'Todas · 1',
      'Competencias · 0',
      'Sociales · 1',
    ]);
  });

  it('lists an unknown kind after the known ones, as stored', () => {
    const rows = [activity({ id: 'x', kind: 'cypher' }), activity({ id: 'w', kind: 'workshop' })];
    expect(options('active', null, rows)).toEqual(['Todas · 2', 'Talleres · 1', 'cypher · 1']);
  });

  it('gives Todas the null kind', () => {
    expect(kindOptions(activities, 'active', null)[0]).toMatchObject({
      kind: null,
      label: 'Todas',
    });
  });
});

describe('overlapping', () => {
  const toprock = activity({
    id: 'toprock',
    name: 'Breaking 1v1 Toprock',
    startsAt: '2026-11-21T16:00:00.000Z',
    endsAt: '2026-11-21T17:00:00.000Z',
  });
  const locking = activity({ ...toprock, id: 'locking', name: 'Locking 1v1 beginner' });
  const next = activity({
    ...toprock,
    id: 'next',
    name: 'Breaking Footwork',
    startsAt: '2026-11-21T17:00:00.000Z',
    endsAt: '2026-11-21T18:00:00.000Z',
  });
  const elsewhere = activity({ ...toprock, id: 'elsewhere', venueId: 'other' });
  const archived = activity({ ...toprock, id: 'archived', status: 'archived' });
  const rows = [toprock, locking, next, elsewhere, archived];
  const of = (target: CatalogActivity) => overlapping(target, rows).map((entry) => entry.id);

  it('finds the other active activities in the same venue whose times overlap', () => {
    expect(of(toprock)).toEqual(['locking']);
    expect(of(locking)).toEqual(['toprock']);
  });

  it('ignores back-to-back times, other venues and archived activities', () => {
    expect(of(next)).toEqual([]);
    expect(of(elsewhere)).toEqual([]);
  });

  it('never reports an archived activity as overlapping', () => {
    expect(of(archived)).toEqual([]);
  });
});

describe('enrollmentCounts', () => {
  const registration = (id: string, activityIds: string[]) => ({
    registrationId: id,
    folio: null,
    fullName: id,
    stageName: null,
    status: 'confirmed' as const,
    eventCheckedInAt: null,
    passTypeIds: [],
    activities: activityIds.map((activityId) => ({ activityId, checkedInAt: null })),
  });
  const lists: AttendeeLists = {
    event: { id: 'event', name: 'Evento' },
    generatedAt: '2026-11-20T12:00:00.000Z',
    passTypes: [],
    activities: [
      { id: 'crews', name: 'Batalla de crews', kind: 'competition', startsAt: crews.startsAt },
      { id: 'bgirl', name: 'Bgirl 1v1', kind: 'competition', startsAt: bgirl.startsAt },
    ],
    registrations: [registration('r1', ['crews', 'bgirl']), registration('r2', ['crews'])],
  };

  it('counts the registrations with access to each listed activity, zero included', () => {
    const counts = enrollmentCounts({
      ...lists,
      registrations: [...lists.registrations, registration('r3', [])],
    });
    expect(counts.get('crews')).toBe(2);
    expect(counts.get('bgirl')).toBe(1);
    expect(enrollmentCounts({ ...lists, registrations: [] }).get('crews')).toBe(0);
  });

  it('only lists the activities someone has access to', () => {
    expect(enrollmentCounts(lists).has('finale')).toBe(false);
  });
});

describe('enrolledCount', () => {
  const counts = new Map([['crews', 2]]);

  it('reads an active competition or workshop missing from the snapshot as zero', () => {
    expect(enrolledCount(counts, crews)).toBe(2);
    expect(enrolledCount(counts, finale)).toBe(0);
    expect(enrolledCount(counts, activity({ id: 'w', kind: 'workshop' }))).toBe(0);
  });

  it('has no count for social or archived activities, or without the snapshot', () => {
    expect(enrolledCount(counts, nightly)).toBeUndefined();
    expect(enrolledCount(counts, { ...crews, status: 'archived' })).toBeUndefined();
    expect(enrolledCount(null, crews)).toBeUndefined();
  });
});

describe('enrolledLabel', () => {
  it.each([
    [0, 'Sin inscritos'],
    [1, '1 inscrito'],
    [4, '4 inscritos'],
  ])('reads %i as %j', (count, label) => {
    expect(enrolledLabel(count)).toBe(label);
  });
});

describe('passNames', () => {
  const pass = (id: string, name: string, activityIds: string[], status = 'active') =>
    ({
      id,
      eventId: 'event',
      name,
      passClass: 'full',
      priceCents: 0,
      requiresPassClass: null,
      onlineSalesClosesAt: null,
      status,
      version: 1,
      activities: activityIds.map((activityId) => ({ activityId, access: 'included' })),
    }) as CatalogPassType;
  const passTypes = [
    pass('full', 'Pase completo Breaking', ['crews', 'bgirl']),
    pass('golden', 'Golden ticket - breaking', ['bgirl']),
    pass('old', 'Pase viejo', ['bgirl'], 'archived'),
  ];

  it('names the active passes that include the activity, in catalog order', () => {
    expect(passNames(passTypes, 'bgirl')).toEqual([
      'Pase completo Breaking',
      'Golden ticket - breaking',
    ]);
    expect(passNames(passTypes, 'finale')).toEqual([]);
  });
});

describe('agendaFooter', () => {
  const eventWindow = {
    startsAt: '2026-11-21T15:00:00.000Z',
    endsAt: '2026-11-23T04:00:00.000Z',
  };

  it('names the event clock and the event dates', () => {
    expect(agendaFooter(timeZone, eventWindow)).toBe(
      'Horas de Ciudad de México. El evento va del 21 al 22 de noviembre de 2026.',
    );
  });

  it('only names the clock when the event has no dates', () => {
    expect(agendaFooter(timeZone, null)).toBe('Horas de Ciudad de México.');
  });

  it('falls back to the zone city for an unknown zone', () => {
    expect(agendaFooter('America/Bogota', null)).toBe('Horas de Bogota.');
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
