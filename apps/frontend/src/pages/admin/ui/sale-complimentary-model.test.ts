import { describe, expect, it } from 'vitest';
import {
  adminRegistrationRuleCodes,
  type AdminRegistrationFailure,
  type HeldPass,
} from '@/entities/admin-registration';
import {
  complimentaryConfirmation,
  complimentaryReasonError,
  complimentaryReasonHint,
  confirmComplimentaryFailure,
  isComplimentarySale,
} from './sale-complimentary-model';

const pass = (id: string, priceCents: number): HeldPass => ({
  registrationPassId: `rp-${id}`,
  passTypeId: `pt-${id}`,
  name: `Pase ${id}`,
  passClass: 'full',
  priceCents,
  selections: [],
});

describe('isComplimentarySale', () => {
  it('applies when the held passes total $0', () => {
    expect(isComplimentarySale([pass('a', 0), pass('b', 0)])).toBe(true);
  });

  it('leaves a registration without passes or with a price to the cash payment', () => {
    expect(isComplimentarySale([])).toBe(false);
    expect(isComplimentarySale([pass('a', 0), pass('b', 20000)])).toBe(false);
  });
});

describe('complimentaryReasonError', () => {
  it('requires a reason of 1 to 500 characters once trimmed', () => {
    expect(complimentaryReasonError('   ')).toBe('Escribe el motivo de la confirmación sin cobro.');
    expect(complimentaryReasonError('x'.repeat(501))).toBe('Usa máximo 500 caracteres.');
    expect(complimentaryReasonError(` ${'x'.repeat(500)} `)).toBeUndefined();
  });
});

describe('complimentaryReasonHint', () => {
  it('counts the trimmed characters against the limit', () => {
    expect(complimentaryReasonHint('')).toBe('0 de 500 caracteres.');
    expect(complimentaryReasonHint('  Golden ticket ')).toBe('13 de 500 caracteres.');
  });
});

describe('complimentaryConfirmation', () => {
  it('restates the participant and the reason, and says it sends the email', () => {
    expect(
      complimentaryConfirmation({
        reason: ' Golden ticket, ganador de la batalla ',
        participantName: 'Ana López',
      }),
    ).toEqual({
      title: '¿Confirmar sin cobro la inscripción de Ana López?',
      consequence:
        'Motivo: Golden ticket, ganador de la batalla. La inscripción quedará confirmada sin pago, con su folio, y se enviará el correo de confirmación.',
    });
  });
});

describe('confirmComplimentaryFailure', () => {
  const failure = (value: AdminRegistrationFailure) => confirmComplimentaryFailure(value);

  it('shows a rejected reason on the reason field, without a reload', () => {
    expect(failure({ kind: 'invalid', fieldErrors: { reason: 'invalid' } })).toEqual({
      field: 'reason',
      message: 'Escribe un motivo de 1 a 500 caracteres.',
      reload: false,
    });
  });

  it('offers a reload when the passes changed since the screen was read', () => {
    expect(failure({ kind: 'rule', code: 'no_passes' })).toEqual({
      field: null,
      message: 'Esta inscripción ya no tiene pases. Recarga para ver su estado.',
      reload: true,
    });
    expect(failure({ kind: 'rule', code: 'not_zero_total' })).toEqual({
      field: null,
      message:
        'Esta inscripción ya tiene un monto a cobrar. Recarga para registrar el pago en efectivo.',
      reload: true,
    });
  });

  it('offers a reload for every rule and an unknown registration', () => {
    for (const code of adminRegistrationRuleCodes)
      expect(failure({ kind: 'rule', code })).toMatchObject({ field: null, reload: true });
    expect(failure({ kind: 'rule', code: 'registration_not_pending' }).message).toBe(
      'Esta inscripción ya no está pendiente. Recarga para ver su estado.',
    );
    expect(failure({ kind: 'not_found' })).toMatchObject({ field: null, reload: true });
  });

  it('never offers a retry when the outcome is unknown', () => {
    expect(failure({ kind: 'unknown' })).toEqual({
      field: null,
      message:
        'No pudimos saber si la inscripción se confirmó. Recarga la inscripción antes de intentarlo de nuevo.',
      reload: true,
    });
  });

  it('explains denials and other failures without a reload', () => {
    expect(failure({ kind: 'forbidden' })).toEqual({
      field: null,
      message: 'Sin acceso: tu cuenta no puede confirmar inscripciones en este evento.',
      reload: false,
    });
    expect(failure({ kind: 'unauthorized' }).reload).toBe(false);
    expect(failure({ kind: 'invalid', fieldErrors: {} })).toEqual({
      field: null,
      message: 'Revisa el motivo de la confirmación.',
      reload: false,
    });
    expect(failure({ kind: 'error' })).toEqual({
      field: null,
      message: 'No pudimos confirmar la inscripción. Intenta de nuevo.',
      reload: false,
    });
  });
});
