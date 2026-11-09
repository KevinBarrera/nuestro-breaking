import type { AttendeeLists } from '@/entities/attendee-list';
import type { CatalogActivity, CatalogPassType } from '@/entities/event-catalog';
import type { EventSales } from '@/entities/event-sales';
import { describe, expect, it } from 'vitest';
import {
  misconfiguredNotice,
  noAccess,
  passAccessSummary,
  passGroups,
  passPriceLabel,
  passTabCounts,
  saleOpen,
  soldCounts,
  soldLabel,
} from './pass-catalog-model';

const activity = (id: string, status: 'active' | 'archived' = 'active'): CatalogActivity => ({
  id,
  eventId: 'event',
  venueId: 'venue',
  kind: 'competition',
  name: id,
  startsAt: '2026-11-21T16:00:00.000Z',
  endsAt: '2026-11-21T17:00:00.000Z',
  status,
  version: 1,
});

const pass = (overrides: Partial<CatalogPassType> & Pick<CatalogPassType, 'id'>) => ({
  eventId: 'event',
  name: overrides.id,
  passClass: 'full' as const,
  priceCents: 200000,
  requiresPassClass: null,
  onlineSalesClosesAt: null,
  status: 'active' as const,
  version: 1,
  activities: [],
  ...overrides,
});

const activities = new Map(
  [activity('toprock'), activity('footwork'), activity('bboy'), activity('old', 'archived')].map(
    (entry) => [entry.id, entry],
  ),
);

describe('passTabCounts', () => {
  it('counts active and archived passes', () => {
    expect(
      passTabCounts([pass({ id: 'a' }), pass({ id: 'b' }), pass({ id: 'c', status: 'archived' })]),
    ).toEqual({ active: 2, archived: 1 });
  });
});

describe('passGroups', () => {
  const list = [
    pass({ id: 'open', passClass: 'add_on' }),
    pass({ id: 'breaking' }),
    pass({ id: 'general', passClass: 'general' }),
    pass({ id: 'popping' }),
    pass({ id: 'gone', status: 'archived' }),
  ];

  it('groups the tab passes by class, full then general then add-ons, keeping the catalog order', () => {
    expect(
      passGroups(list, 'active').map((group) => [
        group.passClass,
        group.label,
        group.help,
        group.passes.map((entry) => entry.id),
      ]),
    ).toEqual([
      [
        'full',
        'Pases completos',
        'Dan acceso a actividades. Es el pase de quien compite.',
        ['breaking', 'popping'],
      ],
      ['general', 'Entrada general', 'Solo la entrada al evento.', ['general']],
      ['add_on', 'Adicionales', 'Se compran junto con un pase completo.', ['open']],
    ]);
  });

  it('leaves out classes with no pass in the tab', () => {
    expect(passGroups(list, 'archived').map((group) => group.passClass)).toEqual(['full']);
    expect(passGroups([], 'active')).toEqual([]);
  });
});

describe('passPriceLabel', () => {
  it('reads a free pass as "Sin costo" and any other in pesos', () => {
    expect(passPriceLabel(0)).toBe('Sin costo');
    expect(passPriceLabel(200000)).toBe('$2,000.00');
  });
});

describe('passAccessSummary', () => {
  it('names a general pass without activities as the event entry', () => {
    expect(passAccessSummary(pass({ id: 'g', passClass: 'general' }), activities)).toBe(
      'Entrada al evento',
    );
  });

  it('joins the included and eligible counts', () => {
    const golden = pass({
      id: 'golden',
      activities: [
        { activityId: 'toprock', access: 'included' },
        { activityId: 'footwork', access: 'included' },
      ],
    });
    expect(passAccessSummary(golden, activities)).toBe('Incluye 2 actividades');
    const breaking = pass({
      id: 'breaking',
      activities: [
        { activityId: 'toprock', access: 'included' },
        { activityId: 'footwork', access: 'selectable' },
        { activityId: 'bboy', access: 'selectable' },
      ],
    });
    expect(passAccessSummary(breaking, activities)).toBe('Incluye 1 actividad · Elige entre 2');
  });

  it('adds the required class of an add-on', () => {
    const open = pass({
      id: 'open',
      passClass: 'add_on',
      requiresPassClass: 'full',
      activities: [{ activityId: 'toprock', access: 'included' }],
    });
    expect(passAccessSummary(open, activities)).toBe(
      'Incluye 1 actividad · Requiere pase completo',
    );
    expect(
      passAccessSummary({ ...open, requiresPassClass: 'general', activities: [] }, activities),
    ).toBe('Sin actividades · Requiere entrada general');
  });

  it('only counts active activities', () => {
    const stale = pass({ id: 'stale', activities: [{ activityId: 'old', access: 'selectable' }] });
    expect(passAccessSummary(stale, activities)).toBe('Sin actividades');
    const generalWithAccess = pass({
      id: 'gx',
      passClass: 'general',
      activities: [{ activityId: 'bboy', access: 'selectable' }],
    });
    expect(passAccessSummary(generalWithAccess, activities)).toBe('Elige entre 1');
  });
});

describe('noAccess', () => {
  it('flags a full or add-on pass with no active activity, never a general one', () => {
    expect(noAccess(pass({ id: 'wacking' }), activities)).toBe(true);
    expect(noAccess(pass({ id: 'open', passClass: 'add_on' }), activities)).toBe(true);
    expect(
      noAccess(
        pass({ id: 'stale', activities: [{ activityId: 'old', access: 'selectable' }] }),
        activities,
      ),
    ).toBe(true);
    expect(noAccess(pass({ id: 'general', passClass: 'general' }), activities)).toBe(false);
    expect(
      noAccess(
        pass({ id: 'ok', activities: [{ activityId: 'bboy', access: 'selectable' }] }),
        activities,
      ),
    ).toBe(false);
  });
});

describe('misconfiguredNotice', () => {
  it('names one pass, counts several, and is null when every pass is fine', () => {
    expect(misconfiguredNotice([pass({ id: 'Wacking' })])).toEqual({
      title: 'Wacking no da acceso a ninguna actividad.',
      text: 'Quien lo compre no podrá inscribirse a competencias. Ábrelo y elige sus actividades, o cámbialo a Entrada general.',
    });
    expect(misconfiguredNotice([pass({ id: 'a' }), pass({ id: 'b' })])?.title).toBe(
      '2 pases no dan acceso a ninguna actividad.',
    );
    expect(misconfiguredNotice([])).toBeNull();
  });
});

describe('soldCounts', () => {
  const registration = (id: string, status: 'confirmed' | 'pending_payment', ids: string[]) => ({
    registrationId: id,
    folio: null,
    fullName: id,
    stageName: null,
    status,
    eventCheckedInAt: null,
    passTypeIds: ids,
    activities: [],
  });
  const lists: AttendeeLists = {
    event: { id: 'event', name: 'Evento' },
    generatedAt: '2026-11-20T12:00:00.000Z',
    passTypes: [],
    activities: [],
    registrations: [
      registration('r1', 'confirmed', ['breaking', 'open']),
      registration('r2', 'confirmed', ['breaking']),
      registration('r3', 'pending_payment', ['breaking', 'open']),
    ],
  };

  it('counts the confirmed registrations holding each pass', () => {
    const counts = soldCounts(lists);
    expect(counts.get('breaking')).toBe(2);
    expect(counts.get('open')).toBe(1);
    expect(counts.get('general')).toBeUndefined();
  });

  it('reads one sale in the singular', () => {
    expect(soldLabel(0)).toBe('vendidos');
    expect(soldLabel(1)).toBe('vendido');
    expect(soldLabel(6)).toBe('vendidos');
  });
});

describe('saleOpen', () => {
  const now = Date.parse('2026-11-10T12:00:00.000Z');
  const sales = (state: 'open' | 'closed'): EventSales => ({
    slug: 'evento',
    salesEnabled: state === 'open',
    salesOpensAt: null,
    salesClosesAt: null,
    state,
    reason: state === 'open' ? null : 'disabled',
  });

  it('is open while the event sells and the pass has not closed', () => {
    expect(saleOpen(pass({ id: 'a' }), sales('open'), now)).toBe(true);
    expect(
      saleOpen(
        pass({ id: 'a', onlineSalesClosesAt: '2026-11-20T05:59:00.000Z' }),
        sales('open'),
        now,
      ),
    ).toBe(true);
  });

  it('is closed once the pass close date passed or when the event sale is closed', () => {
    expect(
      saleOpen(
        pass({ id: 'a', onlineSalesClosesAt: '2026-11-01T05:59:00.000Z' }),
        sales('open'),
        now,
      ),
    ).toBe(false);
    expect(saleOpen(pass({ id: 'a' }), sales('closed'), now)).toBe(false);
  });

  it('only reads the pass date when the event sale state is unknown', () => {
    expect(saleOpen(pass({ id: 'a' }), null, now)).toBe(true);
    expect(
      saleOpen(pass({ id: 'a', onlineSalesClosesAt: '2026-11-01T05:59:00.000Z' }), null, now),
    ).toBe(false);
  });
});
