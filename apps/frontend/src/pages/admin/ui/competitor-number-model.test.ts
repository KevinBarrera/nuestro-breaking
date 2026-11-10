import { describe, expect, it } from 'vitest';
import {
  competitorNumberAction,
  competitorNumberFailureText,
  competitorNumberLines,
  competitorNumberSuccess,
} from './competitor-number-model';

describe('competitorNumberAction', () => {
  it('assigns a first number in the competition', () => {
    expect(competitorNumberAction('Breaking 1v1', null)).toEqual({
      label: 'Asignar número',
      accessibleLabel: 'Asignar número en Breaking 1v1',
      pendingLabel: 'Asignando…',
      title: 'Asignar número en Breaking 1v1',
      consequence: 'Recibirá el siguiente número disponible de esta categoría.',
    });
  });

  it('changes a number in the competition, retiring the current one there', () => {
    expect(competitorNumberAction('Breaking 1v1', 7)).toEqual({
      label: 'Cambiar número',
      accessibleLabel: 'Cambiar número en Breaking 1v1',
      pendingLabel: 'Cambiando…',
      title: 'Cambiar el número 007 de Breaking 1v1',
      consequence:
        'Recibirá el siguiente número disponible de esta categoría y el 007 ya no se le dará a nadie en esta categoría.',
    });
  });
});

describe('competitorNumberSuccess', () => {
  it('names the new number and its competition', () => {
    expect(
      competitorNumberSuccess('Breaking 1v1', {
        competitorNumber: 8,
        previousCompetitorNumber: null,
      }),
    ).toBe('Número 008 asignado en Breaking 1v1.');
    expect(
      competitorNumberSuccess('Breaking 1v1', { competitorNumber: 9, previousCompetitorNumber: 8 }),
    ).toBe('Número de Breaking 1v1 cambiado de 008 a 009.');
  });
});

describe('competitorNumberFailureText', () => {
  it('says how to fix each failure in one sentence, without codes', () => {
    const texts = [
      competitorNumberFailureText({ kind: 'rule', code: 'competitor_number_not_eligible' }),
      competitorNumberFailureText({ kind: 'rule', code: 'competitor_number_not_confirmed' }),
      competitorNumberFailureText({ kind: 'not_found' }),
      competitorNumberFailureText({ kind: 'unauthorized' }),
      competitorNumberFailureText({ kind: 'forbidden' }),
      competitorNumberFailureText({ kind: 'unknown' }),
      competitorNumberFailureText({ kind: 'error' }),
    ];
    expect(texts[0]).toBe(
      'Esta persona no tiene esta categoría en su pase; revisa su inscripción en coordinación.',
    );
    expect(texts[1]).toBe(
      'Su inscripción aún no está confirmada; confirma su pago antes de darle número.',
    );
    for (const text of texts) {
      expect(text).not.toMatch(/competitor_number|_/);
      expect(text.match(/\./g)).toHaveLength(1);
      expect(text.endsWith('.')).toBe(true);
    }
  });
});

describe('competitorNumberLines', () => {
  it('names each number with its competition, in the given order (#377)', () => {
    const activities = [
      { id: 'a-1', name: 'Breaking 1v1' },
      { id: 'a-2', name: 'Breaking crews' },
    ];
    expect(
      competitorNumberLines(
        [
          { activityId: 'a-2', competitorNumber: 12 },
          { activityId: 'a-1', competitorNumber: 3 },
          { activityId: 'a-9', competitorNumber: 1 },
        ],
        activities,
      ),
    ).toEqual([
      { activityId: 'a-2', competition: 'Breaking crews', number: '012' },
      { activityId: 'a-1', competition: 'Breaking 1v1', number: '003' },
      { activityId: 'a-9', competition: 'Categoría', number: '001' },
    ]);
    expect(competitorNumberLines([{ activityId: 'a-1', competitorNumber: 3 }], null)).toEqual([
      { activityId: 'a-1', competition: 'Categoría', number: '003' },
    ]);
    expect(competitorNumberLines([], activities)).toEqual([]);
  });
});
