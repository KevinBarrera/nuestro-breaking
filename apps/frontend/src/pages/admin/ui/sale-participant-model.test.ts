import { describe, expect, it } from 'vitest';
import type { ManualRegistrationInput } from '@/entities/admin-registration';
import { emptyParticipantForm, type ParticipantForm } from '@/entities/participant';
import {
  defaultSalePhoneMode,
  saleParticipantPayload,
  validateSaleParticipant,
} from './sale-participant-model';

const today = '2026-10-08';
const valid: ParticipantForm = {
  ...emptyParticipantForm,
  firstName: ' Ana ',
  firstLastName: 'López',
  email: 'ana@ejemplo.com',
  phone: '33 1234 5678',
};

describe('validateSaleParticipant', () => {
  it('accepts the required fields alone in the default Mexican mode', () => {
    expect(defaultSalePhoneMode).toBe('mx');
    expect(validateSaleParticipant(valid, today)).toEqual({});
  });

  it('asks the operator for every required field, email included', () => {
    expect(validateSaleParticipant(emptyParticipantForm, today)).toEqual({
      firstName: 'Escribe el nombre.',
      firstLastName: 'Escribe el primer apellido.',
      email: 'Escribe el correo del participante.',
      phone: 'Escribe el teléfono celular.',
    });
  });

  it('speaks about the participant in the other messages', () => {
    const errors = validateSaleParticipant(
      { ...valid, email: 'ana@ejemplo', instagram: 'b girl', birthDate: '2001-02-29' },
      today,
    );
    expect(errors).toEqual({
      email: 'Escribe un correo válido, por ejemplo nombre@correo.com.',
      instagram: 'Escribe el usuario sin espacios.',
      birthDate: 'Escribe una fecha válida.',
    });
    expect(validateSaleParticipant({ ...valid, birthDate: '2026-10-09' }, today).birthDate).toBe(
      'La fecha no puede ser futura.',
    );
  });

  it('requires exactly 10 national digits in Mexican mode', () => {
    expect(validateSaleParticipant({ ...valid, phone: '(33) 1234-5678' }, today, 'mx')).toEqual({});
    for (const phone of ['33 1234 567', '33 1234 56789', '+52 33 1234 5678', '33 1234 567a']) {
      expect(validateSaleParticipant({ ...valid, phone }, today, 'mx').phone).toBe(
        'Escribe los 10 dígitos del celular.',
      );
    }
  });

  it('accepts a full international number of 10 to 15 digits with + and separators', () => {
    for (const phone of [
      '+1 (415) 555-0100',
      '4155550100',
      '+44 20.7946.0958 123',
      '+52 1 33 1234 5678',
    ]) {
      expect(validateSaleParticipant({ ...valid, phone }, today, 'international')).toEqual({});
    }
  });

  it('rejects an international number outside 10 to 15 digits or with other characters', () => {
    for (const phone of [
      '+1 415 555 01',
      '+44 20 7946 0958 1234',
      '+1 415 555 01OO',
      '1 415 + 555 0100',
      '++1 415 555 0100',
    ]) {
      expect(validateSaleParticipant({ ...valid, phone }, today, 'international').phone).toBe(
        'Escribe el número completo con clave de país, de 10 a 15 dígitos.',
      );
    }
  });
});

describe('saleParticipantPayload', () => {
  it('sends a Mexican number with the +52 prefix and omits blank optional fields', () => {
    const payload: ManualRegistrationInput = saleParticipantPayload({ ...valid, city: '  ' }, 'mx');
    expect(payload).toEqual({
      firstName: 'Ana',
      firstLastName: 'López',
      email: 'ana@ejemplo.com',
      phone: '+52 3312345678',
    });
  });

  it('sends an international number as + and its digits', () => {
    expect(
      saleParticipantPayload({ ...valid, phone: ' +1 (415) 555-0100 ' }, 'international').phone,
    ).toBe('+14155550100');
    expect(saleParticipantPayload({ ...valid, phone: '4155550100' }, 'international').phone).toBe(
      '+4155550100',
    );
  });

  it('keeps filled optional fields', () => {
    expect(
      saleParticipantPayload({ ...valid, stageName: ' B-Girl Ana ', level: 'Intermedio' }),
    ).toMatchObject({ phone: '+52 3312345678', stageName: 'B-Girl Ana', level: 'Intermedio' });
  });
});
