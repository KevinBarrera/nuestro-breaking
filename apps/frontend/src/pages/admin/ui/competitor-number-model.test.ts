import { describe, expect, it } from 'vitest';
import {
  competitorNumberAction,
  competitorNumberFailureText,
  competitorNumberSuccess,
} from './competitor-number-model';

describe('competitorNumberAction', () => {
  it('assigns a first number', () => {
    expect(competitorNumberAction(null)).toEqual({
      label: 'Asignar número',
      pendingLabel: 'Asignando…',
      title: 'Asignar número',
      consequence: 'Recibirá el siguiente número disponible del evento.',
    });
  });

  it('changes a number, retiring the current one', () => {
    expect(competitorNumberAction(7)).toEqual({
      label: 'Cambiar número',
      pendingLabel: 'Cambiando…',
      title: 'Cambiar el número 007',
      consequence:
        'Recibirá el siguiente número disponible del evento y el 007 ya no se le dará a nadie.',
    });
  });
});

describe('competitorNumberSuccess', () => {
  it('names the new number', () => {
    expect(competitorNumberSuccess({ competitorNumber: 8, previousCompetitorNumber: null })).toBe(
      'Número 008 asignado.',
    );
    expect(competitorNumberSuccess({ competitorNumber: 9, previousCompetitorNumber: 8 })).toBe(
      'Número cambiado de 008 a 009.',
    );
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
      'Esta persona no tiene una competencia en su pase; revisa su inscripción en coordinación.',
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
