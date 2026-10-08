import type { CatalogActivity, CatalogPassType } from '@/entities/event-catalog';
import { describe, expect, it } from 'vitest';
import { catalogStats, describeAccess } from './overview-model';

const activity = (id: string, kind: string, name: string, status = 'active'): CatalogActivity => ({
  id,
  eventId: 'event',
  venueId: 'venue',
  kind,
  name,
  startsAt: '2026-11-14T16:00:00.000Z',
  endsAt: '2026-11-14T18:00:00.000Z',
  status: status as CatalogActivity['status'],
  version: 1,
});

const passType = (overrides: Partial<CatalogPassType>): CatalogPassType => ({
  id: 'pass',
  eventId: 'event',
  name: 'Pase',
  passClass: 'full',
  priceCents: 100000,
  requiresPassClass: null,
  status: 'active',
  version: 1,
  activities: [],
  ...overrides,
});

const battle = activity('battle', 'battle', 'Batalla de crews');
const final = activity('final', 'battle', 'Final 1 vs 1');
const footwork = activity('footwork', 'workshop', 'Taller de footwork');
const toprock = activity('toprock', 'workshop', 'Taller de toprock');
const power = activity('power', 'workshop', 'Taller de power');
const old = activity('old', 'battle', 'Batalla cancelada', 'archived');
const activityById = new Map(
  [battle, final, footwork, toprock, power, old].map((entry) => [entry.id, entry]),
);
const link = (activityId: string, access: 'selectable' | 'included') => ({ activityId, access });

describe('catalogStats', () => {
  it('counts active pass types first, then active activities per kind', () => {
    const passes = [
      passType({ id: 'a' }),
      passType({ id: 'b' }),
      passType({ id: 'c' }),
      passType({ id: 'd', status: 'archived' }),
    ];
    expect(catalogStats([battle, final, footwork, old], passes)).toEqual([
      { label: 'pases activos', count: 3 },
      { label: 'batallas', count: 2 },
      { label: 'talleres', count: 1 },
    ]);
  });

  it('sorts kinds by count, then by label, and names unknown kinds as sent', () => {
    const rows = [battle, footwork, toprock, power, activity('cypher', 'cypher', 'Cypher abierto')];
    expect(catalogStats(rows, [])).toEqual([
      { label: 'pases activos', count: 0 },
      { label: 'talleres', count: 3 },
      { label: 'batallas', count: 1 },
      { label: 'cypher', count: 1 },
    ]);
  });

  it('reports only the pass count when no activity is active', () => {
    expect(catalogStats([old], [passType({})])).toEqual([{ label: 'pases activos', count: 1 }]);
  });
});

describe('describeAccess', () => {
  const access = (overrides: Partial<CatalogPassType>) =>
    describeAccess(passType(overrides), activityById);

  it('counts selectable activities and names up to two included ones', () => {
    expect(
      access({
        activities: [
          link('battle', 'selectable'),
          link('final', 'selectable'),
          link('footwork', 'included'),
        ],
      }),
    ).toBe('2 actividades a elegir · Incluye Taller de footwork');
    expect(
      access({ activities: [link('footwork', 'included'), link('toprock', 'included')] }),
    ).toBe('Incluye Taller de footwork y Taller de toprock');
  });

  it('counts included activities above two instead of naming them', () => {
    expect(
      access({
        activities: [
          link('footwork', 'included'),
          link('toprock', 'included'),
          link('power', 'included'),
        ],
      }),
    ).toBe('3 actividades incluidas');
  });

  it('ignores archived and unknown activities', () => {
    expect(
      access({
        activities: [
          link('battle', 'selectable'),
          link('old', 'selectable'),
          link('missing', 'included'),
          link('footwork', 'included'),
        ],
      }),
    ).toBe('1 actividad a elegir · Incluye Taller de footwork');
    expect(access({ activities: [link('old', 'selectable')] })).toBe('Sin actividades');
  });

  it('says when a pass grants nothing', () => {
    expect(access({})).toBe('Sin actividades');
  });

  it('names the pass class an add-on requires', () => {
    expect(
      access({
        passClass: 'add_on',
        requiresPassClass: 'full',
        activities: [link('battle', 'selectable')],
      }),
    ).toBe('1 actividad a elegir · Requiere pase completo');
    expect(access({ passClass: 'add_on', requiresPassClass: 'general' })).toBe(
      'Sin actividades · Requiere pase general',
    );
  });
});
