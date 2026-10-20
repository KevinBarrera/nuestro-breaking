import { describe, expect, it } from 'vitest';
import {
  adminRegistrationRuleCodes,
  type AdminRegistrationFailure,
  type HeldPass,
} from '@/entities/admin-registration';
import type { CatalogActivity, CatalogPassType, PassTypeActivity } from '@/entities/event-catalog';
import {
  competitionDraft,
  competitionsPayload,
  effectiveDraft,
  saleCompetitionPasses,
  saveCompetitionsFailure,
  toggleCompetition,
  withDraft,
  type SaleCompetitionPass,
} from './sale-competitions-model';

const activity = (
  id: string,
  startsAt: string,
  overrides: Partial<CatalogActivity> = {},
): CatalogActivity => ({
  id,
  eventId: 'event-1',
  venueId: 'venue-1',
  kind: 'competition',
  name: `Competencia ${id}`,
  startsAt,
  endsAt: startsAt,
  status: 'active',
  version: 1,
  ...overrides,
});

const passType = (id: string, activities: PassTypeActivity[]): CatalogPassType => ({
  id,
  eventId: 'event-1',
  name: `Pase ${id}`,
  passClass: 'full',
  priceCents: 10000,
  requiresPassClass: null,
  onlineSalesClosesAt: null,
  status: 'active',
  version: 1,
  activities,
});

const held = (passTypeId: string, selections: string[] = []): HeldPass => ({
  registrationPassId: `held-${passTypeId}`,
  passTypeId,
  name: `Pase ${passTypeId}`,
  passClass: 'full',
  priceCents: 10000,
  selections,
});

const selectable = (activityId: string): PassTypeActivity => ({ activityId, access: 'selectable' });

const popping = activity('popping', '2026-11-14T18:00:00Z', { name: 'Popping 1 vs 1' });
const breaking = activity('breaking', '2026-11-14T16:00:00Z', { name: 'Breaking 1 vs 1' });
const archived = activity('archived', '2026-11-14T15:00:00Z', {
  name: 'Locking',
  status: 'archived',
});
const workshop = activity('workshop', '2026-11-14T12:00:00Z');

const full = passType('full', [
  selectable('popping'),
  selectable('breaking'),
  selectable('archived'),
  { activityId: 'workshop', access: 'included' },
]);
const general = passType('general', []);
const activities = [popping, breaking, archived, workshop];

const pass = (selections: string[] = []): SaleCompetitionPass => {
  const [only] = saleCompetitionPasses([held('full', selections)], [full], activities);
  return only;
};

describe('saleCompetitionPasses', () => {
  it('lists the active selectable activities of each held pass by start time', () => {
    expect(saleCompetitionPasses([held('full')], [full], activities)).toEqual([
      {
        registrationPassId: 'held-full',
        name: 'Pase full',
        saved: [],
        choices: [
          { activityId: 'breaking', name: 'Breaking 1 vs 1', available: true },
          { activityId: 'popping', name: 'Popping 1 vs 1', available: true },
        ],
      },
    ]);
  });

  it('leaves out held passes with nothing to choose', () => {
    expect(saleCompetitionPasses([held('general')], [general], activities)).toEqual([]);
    expect(saleCompetitionPasses([held('missing')], [full], activities)).toEqual([]);
  });

  it('keeps a saved selection that is no longer selectable, marked unavailable', () => {
    const access = passType('full', [selectable('popping')]);
    const [only] = saleCompetitionPasses(
      [held('full', ['archived', 'gone', 'popping'])],
      [access],
      activities,
    );
    expect(only.saved).toEqual(['archived', 'gone', 'popping']);
    expect(only.choices).toEqual([
      { activityId: 'popping', name: 'Popping 1 vs 1', available: true },
      { activityId: 'archived', name: 'Locking', available: false },
      { activityId: 'gone', name: 'Competencia no disponible', available: false },
    ]);
  });
});

describe('toggleCompetition', () => {
  it('adds and removes one activity', () => {
    expect(toggleCompetition(['popping'], 'breaking')).toEqual(['popping', 'breaking']);
    expect(toggleCompetition(['popping', 'breaking'], 'popping')).toEqual(['breaking']);
  });
});

describe('effectiveDraft', () => {
  it('is the saved list until the operator changes something', () => {
    expect(effectiveDraft({}, pass(['popping']))).toEqual(['popping']);
    expect(effectiveDraft({ 'held-other': ['breaking'] }, pass(['popping']))).toEqual(['popping']);
  });

  it('keeps the pass draft even when a refresh brings a new saved list', () => {
    expect(effectiveDraft({ 'held-full': ['breaking'] }, pass(['popping']))).toEqual(['breaking']);
  });
});

describe('withDraft', () => {
  it('records a draft only for the changed pass', () => {
    const drafts = { 'held-other': ['breaking'] };
    expect(withDraft(drafts, pass(), ['popping'])).toEqual({
      'held-other': ['breaking'],
      'held-full': ['popping'],
    });
    expect(drafts).toEqual({ 'held-other': ['breaking'] });
  });

  it('drops the draft once cleared or back to the saved list, in any order', () => {
    const drafts = { 'held-full': ['popping'], 'held-other': ['breaking'] };
    expect(withDraft(drafts, pass(), null)).toEqual({ 'held-other': ['breaking'] });
    expect(withDraft(drafts, pass(['popping', 'breaking']), ['breaking', 'popping'])).toEqual({
      'held-other': ['breaking'],
    });
  });
});

describe('competitionDraft', () => {
  it('cannot be saved while it matches the saved list, in any order', () => {
    expect(competitionDraft(pass(['popping', 'breaking']), ['breaking', 'popping'])).toEqual({
      changed: false,
      blocked: null,
      canSave: false,
    });
  });

  it('can be saved once it differs, including clearing every selection', () => {
    expect(competitionDraft(pass(), ['popping'])).toEqual({
      changed: true,
      blocked: null,
      canSave: true,
    });
    expect(competitionDraft(pass(['popping']), []).canSave).toBe(true);
  });

  it('is blocked while it keeps an unavailable activity, since the backend would reject it', () => {
    const access = passType('full', [selectable('popping'), selectable('breaking')]);
    const [stale] = saleCompetitionPasses([held('full', ['archived'])], [access], activities);
    expect(competitionDraft(stale, ['archived', 'popping'])).toEqual({
      changed: true,
      blocked: 'Desmarca las competencias que ya no están disponibles para guardar.',
      canSave: false,
    });
    expect(competitionDraft(stale, ['popping']).canSave).toBe(true);
  });
});

describe('competitionsPayload', () => {
  it('sends the whole desired list once, in the order shown', () => {
    expect(competitionsPayload(pass(), ['popping', 'breaking', 'popping'])).toEqual([
      'breaking',
      'popping',
    ]);
    expect(competitionsPayload(pass(['popping']), [])).toEqual([]);
  });
});

describe('saveCompetitionsFailure', () => {
  it.each<[string, AdminRegistrationFailure, { message: string; reload: boolean }]>([
    [
      'no access',
      { kind: 'forbidden' },
      {
        message: 'Sin acceso: tu cuenta no puede cambiar competencias en este evento.',
        reload: false,
      },
    ],
    [
      'a lost answer',
      { kind: 'unknown' },
      {
        message:
          'No pudimos confirmar si se guardaron las competencias. Recarga la inscripción antes de intentarlo de nuevo.',
        reload: true,
      },
    ],
    [
      'an activity that is no longer selectable',
      { kind: 'rule', code: 'invalid_activity_selection' },
      {
        message:
          'Alguna competencia ya no está disponible para este pase. Recarga para ver las competencias actuales.',
        reload: true,
      },
    ],
    [
      'a voided registration',
      { kind: 'rule', code: 'registration_voided' },
      { message: 'Esta inscripción está anulada. Recarga para ver su estado.', reload: true },
    ],
    [
      'a missing pass or registration',
      { kind: 'not_found' },
      {
        message: 'No encontramos este pase o la inscripción. Recarga para ver los datos actuales.',
        reload: true,
      },
    ],
    [
      'any other error',
      { kind: 'error' },
      { message: 'No pudimos guardar las competencias. Intenta de nuevo.', reload: false },
    ],
  ])('explains %s', (_, failure, expected) => {
    expect(saveCompetitionsFailure(failure)).toEqual(expected);
  });

  it('offers a reload for every rule answer', () => {
    for (const code of adminRegistrationRuleCodes)
      expect(saveCompetitionsFailure({ kind: 'rule', code }).reload).toBe(true);
  });
});
