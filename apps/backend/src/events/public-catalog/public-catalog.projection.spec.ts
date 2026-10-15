import { toPublicCatalog } from './public-catalog.projection';
import type { CatalogEventRow, CatalogLinkRow, CatalogPassRow } from './public-catalog.types';

const now = new Date('2026-10-20T12:00:00Z');
const event = (overrides: Partial<CatalogEventRow> = {}): CatalogEventRow => ({
  id: 'event-id',
  slug: 'los-mas-pesados-nov-2026',
  name: 'Los más pesados',
  timeZone: 'America/Bogota',
  startsAt: new Date('2026-11-20T14:00:00Z'),
  endsAt: null,
  salesEnabled: true,
  salesOpensAt: new Date('2026-10-15T15:00:00Z'),
  salesClosesAt: null,
  ...overrides,
});
const pass = (id: string, name: string, passClass: string): CatalogPassRow => ({
  id,
  name,
  passClass,
  priceCents: 1000,
  requiresPassClass: passClass === 'add_on' ? 'full' : null,
});
const link = (
  passTypeId: string,
  access: string,
  id: string,
  startsAt: string,
): CatalogLinkRow => ({
  passTypeId,
  access,
  activity: {
    id,
    name: `Activity ${id}`,
    kind: 'competition',
    startsAt: new Date(startsAt),
    endsAt: new Date(new Date(startsAt).getTime() + 3_600_000),
  },
});

describe('toPublicCatalog', () => {
  it('summarizes the event and the sales window as ISO strings', () => {
    const catalog = toPublicCatalog(event(), [], [], now);
    expect(catalog.event).toEqual({
      slug: 'los-mas-pesados-nov-2026',
      name: 'Los más pesados',
      timeZone: 'America/Bogota',
      startsAt: '2026-11-20T14:00:00.000Z',
      endsAt: null,
    });
    expect(catalog.sales).toEqual({
      state: 'open',
      reason: null,
      opensAt: '2026-10-15T15:00:00.000Z',
      closesAt: null,
    });
  });

  it('lists no passes while sales are closed', () => {
    const catalog = toPublicCatalog(
      event({ salesEnabled: false }),
      [pass('p1', 'Pass', 'full')],
      [link('p1', 'selectable', 'a1', '2026-11-20T15:00:00Z')],
      now,
    );
    expect(catalog.sales).toMatchObject({ state: 'closed', reason: 'disabled' });
    expect(catalog.passes).toEqual([]);
  });

  it('orders passes by class, then name, then id', () => {
    const passes = [
      pass('p5', 'Open Styles', 'add_on'),
      pass('p4', 'General', 'general'),
      pass('p3', 'Popping', 'full'),
      pass('p1', 'Breaking', 'full'),
      pass('p0', 'Breaking', 'full'),
    ];
    expect(toPublicCatalog(event(), passes, [], now).passes.map((entry) => entry.id)).toEqual([
      'p0',
      'p1',
      'p3',
      'p4',
      'p5',
    ]);
  });

  it('splits access into selectable and included activities ordered by start time', () => {
    const catalog = toPublicCatalog(
      event(),
      [pass('p1', 'Breaking', 'full'), pass('p2', 'Open Styles', 'add_on')],
      [
        link('p1', 'selectable', 'late', '2026-11-20T18:00:00Z'),
        link('p1', 'selectable', 'early', '2026-11-20T15:00:00Z'),
        link('p2', 'included', 'open', '2026-11-21T18:00:00Z'),
        link('unknown', 'selectable', 'stray', '2026-11-20T10:00:00Z'),
      ],
      now,
    );
    const [breaking, openStyles] = catalog.passes;
    expect(breaking.selectableActivities.map((activity) => activity.id)).toEqual(['early', 'late']);
    expect(breaking.includedActivities).toEqual([]);
    expect(openStyles).toEqual({
      id: 'p2',
      name: 'Open Styles',
      passClass: 'add_on',
      priceCents: 1000,
      requiresPassClass: 'full',
      selectableActivities: [],
      includedActivities: [
        {
          id: 'open',
          name: 'Activity open',
          kind: 'competition',
          startsAt: '2026-11-21T18:00:00.000Z',
          endsAt: '2026-11-21T19:00:00.000Z',
        },
      ],
    });
  });
});
