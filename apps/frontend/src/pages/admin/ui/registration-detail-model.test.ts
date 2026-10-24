import { describe, expect, it } from 'vitest';
import type { HeldPass } from '@/entities/admin-registration';
import type { CatalogActivity, CatalogPassType } from '@/entities/event-catalog';
import { akaLine, cashDifference, heldPassCompetitions } from './registration-detail-model';

describe('akaLine', () => {
  it('names the AKA, or says there is none', () => {
    expect(akaLine('serveroooo')).toBe('AKA serveroooo');
    expect(akaLine(null)).toBe('Sin AKA');
  });
});

describe('cashDifference', () => {
  it('says the cash matches the pass total', () => {
    expect(cashDifference(200000, 200000)).toEqual({
      tone: 'success',
      short: 'Coincide con el total',
      notice: null,
    });
  });

  it('explains cash charged over the pass total', () => {
    expect(cashDifference(200000, 201000)).toEqual({
      tone: 'warning',
      short: 'Cobrado $10.00 de más',
      notice:
        'Se cobraron $10.00 más que el total de los pases ($2,000.00). Si fue un error de captura, corrige el pago.',
    });
  });

  it('explains cash missing from the pass total', () => {
    expect(cashDifference(200000, 150000)).toEqual({
      tone: 'warning',
      short: 'Faltan $500.00',
      notice:
        'Faltan $500.00 para cubrir el total de los pases ($2,000.00). Si fue un error de captura, corrige el pago.',
    });
  });
});

describe('heldPassCompetitions', () => {
  const activity = (id: string, name: string, startsAt: string, kind = 'competition') =>
    ({ id, name, startsAt, kind, status: 'active' }) as CatalogActivity;
  const activities = [
    activity('b', 'Popping 2v2', '2026-11-14T18:00:00Z'),
    activity('a', 'Popping 1v1', '2026-11-14T17:00:00Z'),
    activity('w', 'Taller', '2026-11-14T12:00:00Z', 'workshop'),
    activity('i', 'Kids', '2026-11-14T10:00:00Z'),
  ];
  const passType = (links: { activityId: string; access: string }[]) =>
    ({ id: 'type-1', activities: links }) as CatalogPassType;
  const held = (selections: string[]): HeldPass => ({
    registrationPassId: 'rp-1',
    passTypeId: 'type-1',
    name: 'Pase completo Popping',
    passClass: 'full',
    priceCents: 200000,
    selections,
  });
  const selectable = passType([
    { activityId: 'a', access: 'selectable' },
    { activityId: 'b', access: 'selectable' },
  ]);

  it('names the included competitions by start apart from the chosen ones (#277)', () => {
    const types = [
      passType([
        { activityId: 'i', access: 'included' },
        { activityId: 'w', access: 'included' },
        { activityId: 'a', access: 'selectable' },
      ]),
    ];
    expect(heldPassCompetitions(held(['a']), types, activities)).toEqual({
      included: ['Kids'],
      chosen: ['Popping 1v1'],
    });
  });

  it('shows an empty list for a pass with competitions to choose and none chosen', () => {
    expect(heldPassCompetitions(held([]), [selectable], activities)).toEqual({
      included: [],
      chosen: [],
    });
  });

  it('hides the block for a pass without competitions, and the chosen line for included only', () => {
    expect(heldPassCompetitions(held([]), [passType([])], activities)).toBeNull();
    expect(
      heldPassCompetitions(
        held([]),
        [passType([{ activityId: 'i', access: 'included' }])],
        activities,
      ),
    ).toEqual({ included: ['Kids'], chosen: null });
  });

  it('counts the chosen ones when the activities could not be read', () => {
    expect(heldPassCompetitions(held(['a', 'b']), [selectable], null)).toEqual({
      text: '2 competencias',
    });
  });
});
