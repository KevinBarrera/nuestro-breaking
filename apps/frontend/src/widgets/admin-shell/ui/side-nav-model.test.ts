import { describe, expect, it } from 'vitest';
import { groupOfSection, navGroups, openGroupsFor } from './side-nav-model';

describe('side nav groups', () => {
  it('lists every event section once, in the designed order', () => {
    expect(navGroups.map((group) => [group.title, group.items.map((item) => item.label)])).toEqual([
      [
        'Operación',
        [
          'Resumen',
          'Check-in',
          'Pagos por revisar',
          'Inscripciones',
          'Historial',
          'Listas de respaldo',
        ],
      ],
      ['Catálogo', ['Actividades', 'Pases']],
      ['Configuración', ['Datos del evento']],
    ]);
  });

  it('finds the group that holds a section', () => {
    expect(groupOfSection('payments-review')).toBe('operation');
    expect(groupOfSection('passes')).toBe('catalog');
    expect(groupOfSection('foundation')).toBe('settings');
    expect(groupOfSection(undefined)).toBeUndefined();
  });
});

describe('openGroupsFor', () => {
  it('opens the group of the current section and keeps the ones already open', () => {
    expect(openGroupsFor(new Set(), 'passes')).toEqual(new Set(['catalog']));
    expect(openGroupsFor(new Set(['operation']), 'foundation')).toEqual(
      new Set(['operation', 'settings']),
    );
  });

  it('returns the same set when nothing changes', () => {
    const open = new Set(['catalog'] as const);
    expect(openGroupsFor(open, 'activities')).toBe(open);
    expect(openGroupsFor(open, undefined)).toBe(open);
  });
});
