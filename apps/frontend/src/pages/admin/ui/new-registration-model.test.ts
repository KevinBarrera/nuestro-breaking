import { describe, expect, it } from 'vitest';
import type { HeldPass } from '@/entities/admin-registration';
import type { CatalogActivity, CatalogPassType } from '@/entities/event-catalog';
import {
  addOnState,
  chooseBase,
  cobroLines,
  draftFromHeld,
  draftTotalCents,
  emptyPassDraft,
  passIncludes,
  passPlan,
  receivedAmountHint,
  stepperPasses,
  stepperSteps,
  toggleAddOn,
  toggleChoice,
} from './new-registration-model';

const activity = (id: string, name: string, startsAt: string, status = 'active') =>
  ({ id, name, startsAt, kind: 'competition', status }) as CatalogActivity;
const activities = [
  activity('p2', 'Popping 2v2', '2026-11-14T18:00:00Z'),
  activity('p1', 'Popping 1v1', '2026-11-14T17:00:00Z'),
  activity('os', 'Open Styles 1vs1', '2026-11-14T19:00:00Z'),
  activity('old', 'Retirada', '2026-11-14T10:00:00Z', 'archived'),
];
const passType = (
  id: string,
  name: string,
  passClass: CatalogPassType['passClass'],
  priceCents: number,
  links: { activityId: string; access: 'included' | 'selectable' }[] = [],
  overrides: Partial<CatalogPassType> = {},
) =>
  ({
    id,
    name,
    passClass,
    priceCents,
    requiresPassClass: null,
    status: 'active',
    activities: links,
    ...overrides,
  }) as CatalogPassType;
const general = passType('general', 'Entrada general', 'general', 100000);
const popping = passType('popping', 'Pase completo Popping', 'full', 200000, [
  { activityId: 'p1', access: 'selectable' },
  { activityId: 'p2', access: 'selectable' },
  { activityId: 'old', access: 'selectable' },
]);
const openStyles = passType(
  'open',
  'Open Styles',
  'add_on',
  80000,
  [{ activityId: 'os', access: 'included' }],
  { requiresPassClass: 'full' },
);
const archived = passType('gone', 'Archivado', 'full', 200000, [], { status: 'archived' });
const options = stepperPasses([general, popping, openStyles, archived], activities);

const held = (passTypeId: string, passClass: HeldPass['passClass'], selections: string[] = []) => ({
  registrationPassId: `rp-${passTypeId}`,
  passTypeId,
  name: passTypeId,
  passClass,
  priceCents: passTypeId === 'open' ? 80000 : 200000,
  selections,
});

describe('stepperPasses', () => {
  it('splits the active base passes from the add-ons, with their competitions by start', () => {
    expect(options.bases.map((pass) => pass.passTypeId)).toEqual(['general', 'popping']);
    expect(options.bases[1].choices).toEqual([
      { activityId: 'p1', name: 'Popping 1v1' },
      { activityId: 'p2', name: 'Popping 2v2' },
    ]);
    expect(options.addOns).toMatchObject([
      { passTypeId: 'open', included: ['Open Styles 1vs1'], requiresPassClass: 'full' },
    ]);
  });
});

describe('passIncludes', () => {
  it('says what each pass gives', () => {
    expect(passIncludes(options.bases[0])).toBe('Solo entrada al evento, sin competencias');
    expect(passIncludes(options.bases[1])).toBe('Competencias a elegir');
    expect(passIncludes(options.addOns[0])).toBe('Open Styles 1vs1');
  });
});

describe('pass draft', () => {
  it('chooses a base pass, clearing the previous one and the add-ons it no longer allows', () => {
    let draft = chooseBase(emptyPassDraft, 'popping', options);
    draft = toggleChoice(draft, 'popping', 'p1');
    draft = toggleAddOn(draft, 'open', options);
    expect(draft).toEqual({
      baseId: 'popping',
      addOnIds: ['open'],
      selections: { popping: ['p1'] },
    });
    expect(chooseBase(draft, 'popping', options)).toBe(draft);
    expect(chooseBase(draft, 'general', options)).toEqual({
      baseId: 'general',
      addOnIds: [],
      selections: {},
    });
  });

  it('keeps an add-on off until its required pass is chosen', () => {
    expect(addOnState(options.addOns[0], null)).toEqual({
      available: false,
      hint: 'Requiere un pase completo.',
    });
    expect(addOnState(options.addOns[0], options.bases[1])).toEqual({
      available: true,
      hint: 'Open Styles 1vs1. Se suma al pase completo.',
    });
    expect(toggleAddOn(emptyPassDraft, 'open', options)).toBe(emptyPassDraft);
  });

  it('adds up the chosen passes', () => {
    const draft = { baseId: 'popping', addOnIds: ['open'], selections: {} };
    expect(draftTotalCents(draft, options)).toBe(280000);
    expect(draftTotalCents(emptyPassDraft, options)).toBe(0);
  });

  it('starts from what a resumed registration holds', () => {
    expect(draftFromHeld([held('open', 'add_on'), held('popping', 'full', ['p2'])])).toEqual({
      baseId: 'popping',
      addOnIds: ['open'],
      selections: { open: [], popping: ['p2'] },
    });
  });
});

describe('passPlan', () => {
  it('adds the base before its add-ons and saves only chosen competitions', () => {
    expect(
      passPlan([], { baseId: 'popping', addOnIds: ['open'], selections: { popping: ['p1'] } }),
    ).toEqual({
      remove: [],
      add: ['popping', 'open'],
      selections: [{ passTypeId: 'popping', activityIds: ['p1'] }],
    });
  });

  it('removes add-ons before their base and changes only what differs', () => {
    const current = [held('popping', 'full', ['p1']), held('open', 'add_on')];
    expect(passPlan(current, { baseId: 'general', addOnIds: [], selections: {} })).toEqual({
      remove: [current[1], current[0]],
      add: ['general'],
      selections: [],
    });
    expect(
      passPlan(current, { baseId: 'popping', addOnIds: ['open'], selections: { popping: ['p2'] } }),
    ).toEqual({
      remove: [],
      add: [],
      selections: [{ passTypeId: 'popping', activityIds: ['p2'] }],
    });
    expect(
      passPlan(current, { baseId: 'popping', addOnIds: ['open'], selections: { popping: ['p1'] } }),
    ).toEqual({ remove: [], add: [], selections: [] });
  });
});

describe('cobroLines', () => {
  it('lists each held pass with its competitions and price', () => {
    expect(
      cobroLines([held('popping', 'full', ['p2', 'p1']), held('open', 'add_on')], options),
    ).toEqual([
      {
        key: 'rp-popping',
        name: 'popping',
        detail: 'Popping 1v1, Popping 2v2',
        priceCents: 200000,
      },
      { key: 'rp-open', name: 'open', detail: 'Open Styles 1vs1', priceCents: 80000 },
    ]);
    expect(cobroLines([held('popping', 'full')], options)[0].detail).toBe(
      'Sin competencias elegidas',
    );
    expect(
      cobroLines([{ ...held('general', 'general'), name: 'Entrada general' }], options)[0],
    ).toMatchObject({ detail: 'Entrada al evento' });
  });
});

describe('receivedAmountHint', () => {
  it('compares the cash received with the total without blocking', () => {
    expect(receivedAmountHint(280000, 280000)).toEqual({
      tone: 'success',
      text: 'Coincide con el total.',
    });
    expect(receivedAmountHint(250000, 280000)).toEqual({
      tone: 'warning',
      text: 'No coincide con el total ($2,800.00). Puedes continuar si así dice el recibo.',
    });
    expect(receivedAmountHint(null, 280000)).toEqual({
      tone: 'muted',
      text: 'Lo que recibiste en efectivo.',
    });
  });
});

describe('stepperSteps', () => {
  it('marks done, current and pending steps', () => {
    expect(stepperSteps(2)).toEqual([
      { label: 'Participante', state: 'done' },
      { label: 'Pases', state: 'current' },
      { label: 'Cobro', state: 'pending' },
    ]);
  });
});
