import { describe, expect, it } from 'vitest';
import { groupByKind } from './activity-kind-groups';

describe('groupByKind', () => {
  const item = (name: string, kind: string) => ({ name, kind });

  it('groups by kind in the catalog order, keeping each group in the given order (#410)', () => {
    expect(
      groupByKind(
        [item('Fiesta', 'social'), item('Taller', 'workshop'), item('1v1', 'competition')],
        (entry) => entry.kind,
      ),
    ).toEqual([
      { label: 'Categorías', items: [item('1v1', 'competition')] },
      { label: 'Talleres', items: [item('Taller', 'workshop')] },
      { label: 'Sociales', items: [item('Fiesta', 'social')] },
    ]);
  });

  it('puts an unknown kind last, under a neutral label, and skips empty kinds', () => {
    expect(
      groupByKind([item('Algo', 'battle'), item('Taller', 'workshop')], (e) => e.kind),
    ).toEqual([
      { label: 'Talleres', items: [item('Taller', 'workshop')] },
      { label: 'Otras actividades', items: [item('Algo', 'battle')] },
    ]);
    expect(groupByKind([], (entry: { kind: string }) => entry.kind)).toEqual([]);
  });
});
