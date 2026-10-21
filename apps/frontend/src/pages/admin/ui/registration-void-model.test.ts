import { describe, expect, it } from 'vitest';
import {
  adminRegistrationRuleCodes,
  type AdminRegistrationFailure,
  type RegistrationSummary,
} from '@/entities/admin-registration';
import {
  canVoidRegistration,
  voidReasonError,
  voidReasonHint,
  voidRegistrationFailure,
} from './registration-void-model';

const summary = (overrides: Partial<RegistrationSummary> = {}): RegistrationSummary => ({
  id: 'reg-1',
  status: 'pending_payment',
  folio: null,
  channel: 'in_person',
  participant: {
    fullName: 'Ana López',
    firstName: 'Ana',
    firstLastName: 'López',
    secondLastName: null,
    stageName: null,
  },
  ...overrides,
});

describe('canVoidRegistration', () => {
  it('offers the void only for a pending in-person registration', () => {
    expect(canVoidRegistration(summary())).toBe(true);
  });

  it('leaves out online, confirmed and voided registrations', () => {
    expect(canVoidRegistration(summary({ channel: 'online' }))).toBe(false);
    expect(canVoidRegistration(summary({ status: 'confirmed', folio: 'LMP-7K3Q' }))).toBe(false);
    expect(canVoidRegistration(summary({ status: 'voided' }))).toBe(false);
  });
});

describe('voidReasonError', () => {
  it('requires a reason of 1 to 500 characters once trimmed', () => {
    expect(voidReasonError('   ')).toBe('Escribe el motivo de la anulación.');
    expect(voidReasonError('x'.repeat(501))).toBe('Usa máximo 500 caracteres.');
    expect(voidReasonError(` ${'x'.repeat(500)} `)).toBeUndefined();
  });
});

describe('voidReasonHint', () => {
  it('says the reason stays in the history and counts the trimmed characters', () => {
    expect(voidReasonHint('  Duplicada ')).toBe('Queda en el historial. 9 de 500 caracteres.');
  });
});

describe('voidRegistrationFailure', () => {
  const rule = (code: (typeof adminRegistrationRuleCodes)[number]): AdminRegistrationFailure => ({
    kind: 'rule',
    code,
  });

  it('puts a rejected reason under the field', () => {
    expect(
      voidRegistrationFailure({ kind: 'invalid', fieldErrors: { reason: 'invalid' } }),
    ).toEqual({
      field: 'reason',
      message: 'Escribe un motivo de 1 a 500 caracteres.',
      reload: false,
    });
  });

  it('asks to reload when the registration is no longer pending', () => {
    expect(voidRegistrationFailure(rule('registration_not_pending'))).toEqual({
      field: null,
      message:
        'Esta inscripción ya no está pendiente de pago: ya se confirmó o se anuló. Recarga para ver su estado.',
      reload: true,
    });
  });

  it('explains that an online registration cannot be voided', () => {
    expect(voidRegistrationFailure(rule('online_registration_void_locked'))).toEqual({
      field: null,
      message:
        'Esta inscripción se hizo en línea y no se puede anular: se cancela sola si no se paga a tiempo.',
      reload: true,
    });
  });

  it('asks to reload for an unknown registration or a lost answer', () => {
    expect(voidRegistrationFailure({ kind: 'not_found' })).toEqual({
      field: null,
      message:
        'No encontramos esta inscripción en este evento. Recarga para ver los datos actuales.',
      reload: true,
    });
    expect(voidRegistrationFailure({ kind: 'unknown' })).toEqual({
      field: null,
      message:
        'No pudimos confirmar si la inscripción se anuló. Recarga la inscripción antes de intentarlo de nuevo.',
      reload: true,
    });
  });

  it('lets the operator retry a plain error and explains a denied account', () => {
    expect(voidRegistrationFailure({ kind: 'error' })).toEqual({
      field: null,
      message: 'No pudimos anular la inscripción. Intenta de nuevo.',
      reload: false,
    });
    expect(voidRegistrationFailure({ kind: 'forbidden' })).toEqual({
      field: null,
      message: 'Sin acceso: tu cuenta no puede anular inscripciones en este evento.',
      reload: false,
    });
  });

  it('treats any other rule as a stale screen', () => {
    for (const code of adminRegistrationRuleCodes) {
      const failure = voidRegistrationFailure(rule(code));
      expect(failure.reload).toBe(true);
      expect(failure.message).toMatch(/Recarga|en línea/);
    }
  });
});
