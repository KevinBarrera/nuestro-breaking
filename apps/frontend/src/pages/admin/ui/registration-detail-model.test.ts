import { describe, expect, it } from 'vitest';
import type { HeldPass } from '@/entities/admin-registration';
import type { CatalogActivity, CatalogPassType } from '@/entities/event-catalog';
import { akaLine, cashDifference, heldPassActivities } from './registration-detail-model';

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

describe('heldPassActivities', () => {
  const activity = (id: string, name: string, startsAt: string, kind = 'competition') =>
    ({ id, name, startsAt, kind, status: 'active' }) as CatalogActivity;
  const activities = [
    activity('b', 'Popping 2v2', '2026-11-14T18:00:00Z'),
    activity('a', 'Popping 1v1', '2026-11-14T17:00:00Z'),
    activity('w', 'Taller', '2026-11-14T12:00:00Z', 'workshop'),
    activity('f', 'Workshop intensivo de footwork', '2026-11-14T13:00:00Z', 'workshop'),
    activity('s', 'Fiesta', '2026-11-14T22:00:00Z', 'social'),
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

  it('groups the activities by kind, then by access, included first (#405)', () => {
    const types = [
      passType([
        { activityId: 's', access: 'included' },
        { activityId: 'w', access: 'included' },
        { activityId: 'i', access: 'included' },
        { activityId: 'a', access: 'selectable' },
        { activityId: 'f', access: 'selectable' },
      ]),
    ];
    expect(heldPassActivities(held(['f', 'a']), types, activities)).toEqual({
      groups: [
        { label: 'Categorías incluidas', names: ['Kids'] },
        { label: 'Categorías elegidas', names: ['Popping 1v1'] },
        { label: 'Talleres incluidos', names: ['Taller'] },
        { label: 'Talleres elegidos', names: ['Workshop intensivo de footwork'] },
        { label: 'Sociales incluidas', names: ['Fiesta'] },
      ],
    });
  });

  it('lists a chosen workshop as a workshop, never as a competition (#405)', () => {
    const types = [
      passType([
        { activityId: 'i', access: 'included' },
        { activityId: 'f', access: 'selectable' },
      ]),
    ];
    expect(heldPassActivities(held(['f']), types, activities)).toEqual({
      groups: [
        { label: 'Categorías incluidas', names: ['Kids'] },
        { label: 'Talleres elegidos', names: ['Workshop intensivo de footwork'] },
      ],
    });
  });

  it('lists the included activities by start', () => {
    const types = [
      passType([
        { activityId: 'b', access: 'included' },
        { activityId: 'a', access: 'included' },
      ]),
    ];
    expect(heldPassActivities(held([]), types, activities)).toEqual({
      groups: [{ label: 'Categorías incluidas', names: ['Popping 1v1', 'Popping 2v2'] }],
    });
  });

  it('says nothing was chosen for a pass with activities to choose and none chosen', () => {
    expect(heldPassActivities(held([]), [selectable], activities)).toEqual({
      groups: [{ label: 'Actividades elegidas', names: [], empty: 'Sin actividades elegidas.' }],
    });
  });

  it('names an unknown chosen activity without assuming its kind', () => {
    expect(heldPassActivities(held(['a', 'gone']), [selectable], activities)).toEqual({
      groups: [
        { label: 'Categorías elegidas', names: ['Popping 1v1'] },
        { label: 'Actividades elegidas', names: ['Actividad no disponible'] },
      ],
    });
  });

  it('hides the block for a pass without activities, and the chosen line for included only', () => {
    expect(heldPassActivities(held([]), [passType([])], activities)).toBeNull();
    expect(
      heldPassActivities(
        held([]),
        [passType([{ activityId: 'w', access: 'included' }])],
        activities,
      ),
    ).toEqual({ groups: [{ label: 'Talleres incluidos', names: ['Taller'] }] });
  });

  it('counts the chosen ones when the activities could not be read', () => {
    expect(heldPassActivities(held(['a', 'b']), [selectable], null)).toEqual({
      text: '2 actividades',
    });
    expect(heldPassActivities(held(['a']), [selectable], null)).toEqual({ text: '1 actividad' });
    expect(heldPassActivities(held([]), [selectable], null)).toEqual({
      groups: [{ label: 'Actividades elegidas', names: [], empty: 'Sin actividades elegidas.' }],
    });
  });
});
