import { describe, expect, it } from 'vitest';
import type { HeldPass } from '@/entities/admin-registration';
import type { CatalogActivity, CatalogPassType } from '@/entities/event-catalog';
import {
  editableCompetitionPass,
  reviewSelectionChange,
  selectionChangeConfirmation,
  selectionChangeFailure,
  selectionReasonError,
  selectionReasonHint,
} from './confirmed-competitions-model';
import type { SaleCompetitionPass } from './sale-competitions-model';

const activity = (id: string, name: string, startsAt: string): CatalogActivity => ({
  id,
  eventId: 'event-1',
  venueId: 'venue-1',
  kind: 'competition',
  name,
  startsAt,
  endsAt: startsAt,
  status: 'active',
  version: 1,
});

const breaking = activity('a1', 'Breaking 1 vs 1', '2026-11-14T16:00:00Z');
const popping = activity('a2', 'Popping 1 vs 1', '2026-11-14T18:00:00Z');

const passType = (id: string, selectable: string[]): CatalogPassType => ({
  id,
  eventId: 'event-1',
  name: `Pase ${id}`,
  passClass: 'full',
  priceCents: 10000,
  requiresPassClass: null,
  onlineSalesClosesAt: null,
  status: 'active',
  version: 1,
  activities: selectable.map((activityId) => ({ activityId, access: 'selectable' })),
});

const held = (passTypeId: string, selections: string[]): HeldPass => ({
  registrationPassId: `held-${passTypeId}`,
  passTypeId,
  name: 'Pase completo',
  passClass: 'full',
  priceCents: 10000,
  selections,
});

const pass: SaleCompetitionPass = {
  registrationPassId: 'held-1',
  name: 'Pase completo',
  saved: ['a2'],
  choices: [
    { activityId: 'a1', name: 'Breaking 1 vs 1', available: true },
    { activityId: 'a2', name: 'Popping 1 vs 1', available: true },
  ],
};

describe('editableCompetitionPass', () => {
  it('offers the selectable competitions of a held pass', () => {
    expect(
      editableCompetitionPass(
        held('t1', ['a2']),
        [passType('t1', ['a1', 'a2'])],
        [popping, breaking],
      ),
    ).toEqual({
      registrationPassId: 'held-t1',
      name: 'Pase completo',
      saved: ['a2'],
      choices: [
        { activityId: 'a1', name: 'Breaking 1 vs 1', available: true },
        { activityId: 'a2', name: 'Popping 1 vs 1', available: true },
      ],
    });
  });

  it('offers nothing for a pass without choices or an unreadable catalog', () => {
    expect(editableCompetitionPass(held('t1', []), [passType('t1', [])], [breaking])).toBeNull();
    expect(editableCompetitionPass(held('t1', []), null, [breaking])).toBeNull();
    expect(editableCompetitionPass(held('t1', []), [passType('t1', ['a1'])], null)).toBeNull();
  });

  it('offers nothing when the only choice is a saved one that is no longer selectable', () => {
    expect(
      editableCompetitionPass(held('t1', ['a1']), [passType('t1', [])], [breaking]),
    ).toBeNull();
    expect(editableCompetitionPass(held('t1', ['a1']), [], [breaking])).toBeNull();
  });
});

describe('selection change reason', () => {
  it('requires 1 to 500 characters once trimmed', () => {
    expect(selectionReasonError('')).toBe('Escribe el motivo del cambio.');
    expect(selectionReasonError('   ')).toBe('Escribe el motivo del cambio.');
    expect(selectionReasonError(` ${'a'.repeat(500)} `)).toBeUndefined();
    expect(selectionReasonError('a'.repeat(501))).toBe('Usa máximo 500 caracteres.');
  });

  it('counts the trimmed characters', () => {
    expect(selectionReasonHint('  Cambio  ')).toBe('6 de 500 caracteres.');
  });
});

describe('reviewSelectionChange', () => {
  it('accepts a changed list with a reason, trimmed and in the order shown', () => {
    expect(reviewSelectionChange(pass, ['a2', 'a1'], '  Pidió cambiar  ')).toEqual({
      ok: true,
      activityIds: ['a1', 'a2'],
      reason: 'Pidió cambiar',
    });
  });

  it('blocks a blank reason and an unchanged list, reporting both', () => {
    expect(reviewSelectionChange(pass, ['a2'], ' ')).toEqual({
      ok: false,
      reasonError: 'Escribe el motivo del cambio.',
      selectionError: 'Cambia al menos una competencia para guardar.',
    });
    expect(reviewSelectionChange(pass, ['a2'], 'Motivo')).toEqual({
      ok: false,
      selectionError: 'Cambia al menos una competencia para guardar.',
    });
    expect(reviewSelectionChange(pass, [], '')).toEqual({
      ok: false,
      reasonError: 'Escribe el motivo del cambio.',
    });
  });

  it('blocks keeping a competition that is no longer available', () => {
    const stale: SaleCompetitionPass = {
      ...pass,
      saved: ['gone'],
      choices: [...pass.choices, { activityId: 'gone', name: 'Vieja', available: false }],
    };
    expect(reviewSelectionChange(stale, ['gone', 'a1'], 'Motivo')).toEqual({
      ok: false,
      selectionError: 'Desmarca las competencias que ya no están disponibles para guardar.',
    });
  });
});

describe('selectionChangeConfirmation', () => {
  it('restates the competitions before and after and the reason', () => {
    expect(selectionChangeConfirmation(pass, ['a1'], 'Pidió cambiar')).toEqual({
      title: '¿Cambiar las competencias de «Pase completo»?',
      consequence:
        'Antes: Popping 1 vs 1. Después: Breaking 1 vs 1. Motivo: Pidió cambiar. El cambio quedará registrado con este motivo.',
    });
  });

  it('names an empty list', () => {
    expect(selectionChangeConfirmation({ ...pass, saved: [] }, ['a2', 'a1'], 'M').consequence).toBe(
      'Antes: Sin competencias. Después: Breaking 1 vs 1, Popping 1 vs 1. Motivo: M. El cambio quedará registrado con este motivo.',
    );
    expect(selectionChangeConfirmation(pass, [], 'M').consequence).toMatch(
      /^Antes: Popping 1 vs 1\. Después: Sin competencias\./,
    );
  });
});

describe('selectionChangeFailure', () => {
  it('puts a rejected reason on the reason field', () => {
    expect(selectionChangeFailure({ kind: 'invalid', fieldErrors: { reason: 'invalid' } })).toEqual(
      { field: 'reason', message: 'Escribe un motivo de 1 a 500 caracteres.', reload: false },
    );
  });

  it('shows any other failure as a message, offering a reload when the screen may be stale', () => {
    expect(selectionChangeFailure({ kind: 'invalid', fieldErrors: {} })).toEqual({
      field: null,
      message: 'No pudimos guardar las competencias. Intenta de nuevo.',
      reload: false,
    });
    expect(selectionChangeFailure({ kind: 'rule', code: 'registration_voided' })).toEqual({
      field: null,
      message: 'Esta inscripción está anulada. Recarga para ver su estado.',
      reload: true,
    });
    expect(selectionChangeFailure({ kind: 'unknown' })).toMatchObject({
      field: null,
      reload: true,
    });
    expect(selectionChangeFailure({ kind: 'error' })).toEqual({
      field: null,
      message: 'No pudimos guardar las competencias. Intenta de nuevo.',
      reload: false,
    });
  });
});
