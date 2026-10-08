import type { CatalogActivity, CatalogPassType } from '@/entities/event-catalog';
import { describe, expect, it } from 'vitest';
import { passAccessRows, passFieldRows } from './pass-changes';

const pass: CatalogPassType = {
  id: 'pass',
  eventId: 'event',
  name: 'Pase completo',
  passClass: 'full',
  priceCents: 150000,
  requiresPassClass: null,
  status: 'active',
  version: 2,
  activities: [],
};

const activity = (id: string, name: string): CatalogActivity => ({
  id,
  eventId: 'event',
  venueId: 'venue',
  kind: 'battle',
  name,
  startsAt: '2026-11-14T16:00:00.000Z',
  endsAt: '2026-11-14T18:00:00.000Z',
  status: 'active',
  version: 1,
});

describe('passFieldRows', () => {
  it('lists each changed field with labels and pesos, in form order', () => {
    expect(
      passFieldRows(pass, {
        name: 'Pase VIP',
        passClass: 'add_on',
        priceCents: 175050,
        requiresPassClass: 'full',
      }),
    ).toEqual([
      { key: 'name', label: 'Nombre', before: 'Pase completo', after: 'Pase VIP' },
      { key: 'passClass', label: 'Clase', before: 'Completo', after: 'Adicional' },
      { key: 'price', label: 'Precio', before: '$1,500.00', after: '$1,750.50' },
      { key: 'requiresPassClass', label: 'Requiere pase', before: 'Ninguno', after: 'Completo' },
    ]);
  });

  it('is empty when nothing changed', () => {
    const { name, passClass, priceCents, requiresPassClass } = pass;
    expect(passFieldRows(pass, { name, passClass, priceCents, requiresPassClass })).toEqual([]);
  });

  it('lists a new pass against "—" and leaves out an unset required class', () => {
    expect(
      passFieldRows(undefined, {
        name: 'Entrada general',
        passClass: 'general',
        priceCents: 30000,
        requiresPassClass: null,
      }),
    ).toEqual([
      { key: 'name', label: 'Nombre', before: '—', after: 'Entrada general' },
      { key: 'passClass', label: 'Clase', before: '—', after: 'General' },
      { key: 'price', label: 'Precio', before: '—', after: '$300.00' },
    ]);
  });
});

describe('passAccessRows', () => {
  const crews = activity('crews', 'Batalla de crews');
  const duo = activity('duo', 'Batalla 2 vs 2');

  it('lists only changed activities, in list order, as "Sin acceso" when unlinked', () => {
    expect(
      passAccessRows(
        [crews, duo],
        [
          { activityId: 'duo', access: 'included' },
          { activityId: 'crews', access: 'selectable' },
        ],
        [
          { activityId: 'crews', access: 'included' },
          { activityId: 'duo', access: 'included' },
        ],
      ),
    ).toEqual([
      { key: 'access:crews', label: 'Batalla de crews', before: 'Elegible', after: 'Incluida' },
    ]);
    expect(passAccessRows([crews, duo], [], [{ activityId: 'duo', access: 'selectable' }])).toEqual(
      [{ key: 'access:duo', label: 'Batalla 2 vs 2', before: 'Sin acceso', after: 'Elegible' }],
    );
  });

  it('lists a dropped link to an unknown activity last under a generic name', () => {
    expect(
      passAccessRows(
        [crews],
        [{ activityId: 'gone', access: 'included' }],
        [{ activityId: 'crews', access: 'included' }],
      ).map((row) => [row.label, row.before, row.after]),
    ).toEqual([
      ['Batalla de crews', 'Sin acceso', 'Incluida'],
      ['Actividad no disponible', 'Incluida', 'Sin acceso'],
    ]);
  });
});
