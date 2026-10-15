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
  onlineSalesClosesAt: null,
  status: 'active',
  version: 2,
  activities: [],
};

const zone = 'America/Mexico_City';

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
      passFieldRows(
        pass,
        {
          name: 'Pase VIP',
          passClass: 'add_on',
          priceCents: 175050,
          requiresPassClass: 'full',
          onlineSalesClosesAt: '2026-11-17T15:00:00.000Z',
        },
        zone,
      ),
    ).toEqual([
      { key: 'name', label: 'Nombre', before: 'Pase completo', after: 'Pase VIP' },
      { key: 'passClass', label: 'Clase', before: 'Completo', after: 'Adicional' },
      { key: 'price', label: 'Precio', before: '$1,500.00', after: '$1,750.50' },
      { key: 'requiresPassClass', label: 'Requiere pase', before: 'Ninguno', after: 'Completo' },
      {
        key: 'onlineSalesClosesAt',
        label: 'Cierre de venta en línea',
        before: 'Sigue la venta del evento',
        after: '17 nov 2026, 09:00',
      },
    ]);
  });

  it('reads a cleared online sales close time as following the event (#240)', () => {
    const closing = { ...pass, onlineSalesClosesAt: '2026-11-20T16:00:00.000Z' };
    const { name, passClass, priceCents, requiresPassClass } = pass;
    expect(
      passFieldRows(
        closing,
        { name, passClass, priceCents, requiresPassClass, onlineSalesClosesAt: null },
        zone,
      ),
    ).toEqual([
      {
        key: 'onlineSalesClosesAt',
        label: 'Cierre de venta en línea',
        before: '20 nov 2026, 10:00',
        after: 'Sigue la venta del evento',
      },
    ]);
  });

  it('is empty when nothing changed', () => {
    const { name, passClass, priceCents, requiresPassClass, onlineSalesClosesAt } = pass;
    expect(
      passFieldRows(
        pass,
        { name, passClass, priceCents, requiresPassClass, onlineSalesClosesAt },
        zone,
      ),
    ).toEqual([]);
  });

  it('lists a new pass against "—" and leaves out an unset required class and close time', () => {
    expect(
      passFieldRows(
        undefined,
        {
          name: 'Entrada general',
          passClass: 'general',
          priceCents: 30000,
          requiresPassClass: null,
          onlineSalesClosesAt: null,
        },
        zone,
      ),
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
