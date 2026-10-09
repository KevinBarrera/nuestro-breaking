import { describe, expect, it } from 'vitest';
import { passGroups } from './pass-groups';
import { emptySelection, passOptions } from './purchase-selection';
import { catalogPasses } from './test-fixtures';

describe('passGroups', () => {
  it('groups full passes, then add-ons, then general entry, keeping catalog order', () => {
    const groups = passGroups(passOptions(catalogPasses, emptySelection));
    expect(groups.map((group) => [group.title, group.options.map((o) => o.pass.id)])).toEqual([
      ['Pases completos', ['breaking', 'popping']],
      ['Adicional', ['open-styles']],
      ['Solo asistir', ['general']],
    ]);
  });

  it('leaves out classes the catalog does not sell', () => {
    const groups = passGroups(passOptions(catalogPasses.slice(0, 2), emptySelection));
    expect(groups.map((group) => group.passClass)).toEqual(['full']);
  });
});
