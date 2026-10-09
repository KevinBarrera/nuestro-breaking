import { describe, expect, it } from 'vitest';
import { breaking, catalogPasses, general, openStyles } from './test-fixtures';
import {
  competitionGroups,
  competitionsStepApplies,
  emptySelection,
  normalizeSelection,
  passOptions,
  purchaseTotals,
  toggleActivity,
  togglePass,
} from './purchase-selection';

const choose = (...ids: string[]) =>
  ids.reduce((selection, id) => togglePass(catalogPasses, selection, id), emptySelection);

const option = (selection: ReturnType<typeof choose>, id: string) =>
  passOptions(catalogPasses, selection).find((entry) => entry.pass.id === id);

describe('togglePass', () => {
  it('adds and removes passes, keeping catalog order', () => {
    expect(choose('popping', 'breaking').passTypeIds).toEqual(['breaking', 'popping']);
    expect(choose('breaking', 'breaking').passTypeIds).toEqual([]);
  });

  it('removes general entry when a full pass is chosen and refuses general after that', () => {
    expect(choose('general', 'breaking').passTypeIds).toEqual(['breaking']);
    expect(choose('breaking', 'general').passTypeIds).toEqual(['breaking']);
  });

  it('allows an add-on only with its required class and drops it when that class goes', () => {
    expect(choose('open-styles').passTypeIds).toEqual([]);
    expect(choose('breaking', 'open-styles').passTypeIds).toEqual(['breaking', 'open-styles']);
    expect(choose('breaking', 'open-styles', 'breaking').passTypeIds).toEqual([]);
    expect(choose('breaking', 'popping', 'open-styles', 'breaking').passTypeIds).toEqual([
      'popping',
      'open-styles',
    ]);
  });

  it('forgets the competitions of a removed pass', () => {
    const selection = toggleActivity(catalogPasses, choose('breaking'), 'breaking', 'bboy');
    expect(selection.selectedActivityIds).toEqual({ breaking: ['bboy'] });
    expect(togglePass(catalogPasses, selection, 'breaking').selectedActivityIds).toEqual({});
  });
});

describe('toggleActivity', () => {
  it('toggles only selectable activities of a chosen pass', () => {
    const selection = choose('breaking');
    const picked = toggleActivity(catalogPasses, selection, 'breaking', 'bgirl');
    expect(picked.selectedActivityIds).toEqual({ breaking: ['bgirl'] });
    expect(toggleActivity(catalogPasses, picked, 'breaking', 'bgirl').selectedActivityIds).toEqual(
      {},
    );
    expect(toggleActivity(catalogPasses, selection, 'breaking', 'popping-1v1')).toBe(selection);
    expect(toggleActivity(catalogPasses, selection, 'popping', 'popping-1v1')).toBe(selection);
  });

  it('keeps picked activities in catalog order', () => {
    let selection = toggleActivity(catalogPasses, choose('breaking'), 'breaking', 'bgirl');
    selection = toggleActivity(catalogPasses, selection, 'breaking', 'bboy');
    expect(selection.selectedActivityIds.breaking).toEqual(['bboy', 'bgirl']);
  });
});

describe('normalizeSelection', () => {
  it('drops unknown ids and combinations the rules forbid', () => {
    expect(
      normalizeSelection(catalogPasses, {
        passTypeIds: ['general', 'ghost', 'open-styles', 'breaking'],
        selectedActivityIds: { breaking: ['bboy', 'ghost'], general: ['bboy'], ghost: ['x'] },
      }),
    ).toEqual({
      passTypeIds: ['breaking', 'open-styles'],
      selectedActivityIds: { breaking: ['bboy'] },
    });
    expect(
      normalizeSelection(catalogPasses, { passTypeIds: ['open-styles'], selectedActivityIds: {} }),
    ).toEqual(emptySelection);
  });
});

describe('passOptions', () => {
  it('explains disabled and enabled states with Spanish hints', () => {
    const none = choose();
    expect(option(none, 'open-styles')).toMatchObject({
      selected: false,
      disabled: true,
      hint: 'Requiere un pase completo',
    });
    expect(option(none, 'breaking')).toMatchObject({
      disabled: false,
      hint: '2 competencias para elegir',
    });
    expect(option(none, 'popping')?.hint).toBe('1 competencia para elegir');
    expect(option(none, 'general')).toMatchObject({ disabled: false, hint: null });

    const full = choose('breaking');
    expect(option(full, 'general')).toMatchObject({
      disabled: true,
      hint: 'Ya incluida en tus pases completos',
    });
    expect(option(full, 'open-styles')).toMatchObject({
      disabled: false,
      hint: 'Disponible porque elegiste un pase completo',
    });
  });

  it('describes a pass without choices by what it includes', () => {
    const dancehall = { ...general, id: 'dancehall', passClass: 'full' as const };
    const withIncluded = { ...dancehall, includedActivities: openStyles.includedActivities };
    const [entry] = passOptions([withIncluded], emptySelection);
    expect(entry.hint).toBe('Incluye: Competencia 1vs1');
  });
});

describe('competitions and totals', () => {
  it('offers competitions only for chosen passes and shows included ones', () => {
    const groups = competitionGroups(catalogPasses, choose('breaking', 'open-styles'));
    expect(groups.map((group) => group.pass.id)).toEqual(['breaking', 'open-styles']);
    expect(groups[0].selectable.map((entry) => entry.activity.id)).toEqual(['bboy', 'bgirl']);
    expect(groups[1].included.map((activity) => activity.id)).toEqual(['open-1v1']);
  });

  it('marks picked competitions as selected', () => {
    const selection = toggleActivity(catalogPasses, choose('popping'), 'popping', 'popping-1v1');
    expect(competitionGroups(catalogPasses, selection)[0].selectable[0].selected).toBe(true);
  });

  it('applies the competitions step only when a chosen pass has choices (D6)', () => {
    expect(competitionsStepApplies(catalogPasses, choose('general'))).toBe(false);
    expect(competitionsStepApplies(catalogPasses, choose('breaking'))).toBe(true);
    expect(
      competitionsStepApplies([general, { ...breaking, selectableActivities: [] }, openStyles], {
        passTypeIds: ['breaking', 'open-styles'],
        selectedActivityIds: {},
      }),
    ).toBe(false);
  });

  it('sums prices and counts passes', () => {
    expect(purchaseTotals(catalogPasses, choose('breaking', 'popping', 'open-styles'))).toEqual({
      passCount: 3,
      totalCents: 480000,
    });
    expect(purchaseTotals(catalogPasses, emptySelection)).toEqual({ passCount: 0, totalCents: 0 });
  });
});
