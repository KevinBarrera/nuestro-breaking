import { describe, expect, it } from 'vitest';
import { buyerPayload, emptyBuyerForm, validateBuyer, type BuyerForm } from './buyer-form';

const today = '2026-10-08';
const valid: BuyerForm = {
  ...emptyBuyerForm,
  firstName: ' Ana ',
  firstLastName: 'López',
  email: 'ana@ejemplo.com',
  phone: '33 1234 5678',
};

describe('validateBuyer', () => {
  it('accepts the required fields alone', () => {
    expect(validateBuyer(valid, today)).toEqual({});
  });

  it('asks for every required field', () => {
    expect(validateBuyer({ ...emptyBuyerForm, firstName: '   ' }, today)).toEqual({
      firstName: 'Escribe tu nombre.',
      firstLastName: 'Escribe tu primer apellido.',
      email: 'Escribe tu correo electrónico.',
      phone: 'Escribe tu teléfono celular.',
    });
  });

  it('checks the email shape and the 10-digit phone', () => {
    const errors = validateBuyer({ ...valid, email: 'ana@ejemplo', phone: '33 1234 567' }, today);
    expect(errors.email).toBe('Escribe un correo válido, por ejemplo nombre@correo.com.');
    expect(errors.phone).toBe('Escribe los 10 dígitos de tu celular.');
    expect(validateBuyer({ ...valid, phone: '(33) 1234-5678' }, today)).toEqual({});
    expect(validateBuyer({ ...valid, phone: '+52 33 1234 5678' }, today).phone).toBeDefined();
  });

  it('applies the backend length limits', () => {
    const errors = validateBuyer(
      {
        ...valid,
        firstName: 'a'.repeat(101),
        secondLastName: 'a'.repeat(101),
        stageName: 'a'.repeat(101),
        email: `${'a'.repeat(250)}@b.mx`,
        city: 'a'.repeat(101),
        instagram: 'a'.repeat(65),
        level: 'a'.repeat(51),
      },
      today,
    );
    expect(Object.keys(errors).sort()).toEqual([
      'city',
      'email',
      'firstName',
      'instagram',
      'level',
      'secondLastName',
      'stageName',
    ]);
    expect(errors.level).toBe('Usa máximo 50 caracteres.');
    expect(errors.email).toBe('Usa máximo 254 caracteres.');
  });

  it('accepts an Instagram handle with @ and rejects spaces', () => {
    expect(validateBuyer({ ...valid, instagram: '@b.girl_ana' }, today)).toEqual({});
    expect(validateBuyer({ ...valid, instagram: 'b girl' }, today).instagram).toBe(
      'Escribe tu usuario sin espacios.',
    );
    expect(validateBuyer({ ...valid, instagram: '@' }, today).instagram).toBe(
      'Escribe tu usuario sin espacios.',
    );
  });

  it('accepts a real past birth date up to today', () => {
    expect(validateBuyer({ ...valid, birthDate: '2000-02-29' }, today)).toEqual({});
    expect(validateBuyer({ ...valid, birthDate: today }, today)).toEqual({});
    expect(validateBuyer({ ...valid, birthDate: '2001-02-29' }, today).birthDate).toBe(
      'Escribe una fecha válida.',
    );
    expect(validateBuyer({ ...valid, birthDate: '1899-12-31' }, today).birthDate).toBe(
      'Escribe una fecha válida.',
    );
    expect(validateBuyer({ ...valid, birthDate: '2026-10-09' }, today).birthDate).toBe(
      'La fecha no puede ser futura.',
    );
  });
});

describe('buyerPayload', () => {
  it('trims text, omits blank optional fields and adds the +52 prefix', () => {
    expect(buyerPayload(valid)).toEqual({
      firstName: 'Ana',
      firstLastName: 'López',
      email: 'ana@ejemplo.com',
      phone: '+52 3312345678',
    });
  });

  it('keeps filled optional fields', () => {
    expect(
      buyerPayload({
        ...valid,
        secondLastName: ' García ',
        stageName: 'B-Girl Ana',
        city: 'Guadalajara',
        instagram: '@b.girl_ana',
        level: 'Intermedio',
        birthDate: '2000-02-29',
      }),
    ).toMatchObject({
      secondLastName: 'García',
      stageName: 'B-Girl Ana',
      city: 'Guadalajara',
      instagram: '@b.girl_ana',
      level: 'Intermedio',
      birthDate: '2000-02-29',
    });
  });
});
