import { describe, expect, it } from 'vitest';
import {
  emptyParticipantForm,
  firstInvalidField,
  instagramHandle,
  isCalendarDate,
  participantPayload,
  stripPhoneSeparators,
  validateParticipant,
  type ParticipantForm,
  type ParticipantMessages,
} from './participant-form';

const today = '2026-10-08';
const valid: ParticipantForm = {
  ...emptyParticipantForm,
  firstName: 'Ana',
  firstLastName: 'López',
  email: 'ana@ejemplo.com',
  phone: '33 1234 5678',
};

const messages: ParticipantMessages = {
  required: { firstName: 'name', firstLastName: 'last', email: 'mail', phone: 'phone' },
  invalid: { email: 'bad mail', phone: 'bad phone', instagram: 'bad ig', birthDate: 'bad date' },
  tooLong: (max) => `max ${max}`,
  inFuture: 'future',
};
const rules = { messages, phoneIsValid: (phone: string) => phone.startsWith('33') };

describe('validateParticipant', () => {
  it('uses the given messages for required fields', () => {
    expect(validateParticipant(emptyParticipantForm, today, rules)).toEqual({
      firstName: 'name',
      firstLastName: 'last',
      email: 'mail',
      phone: 'phone',
    });
  });

  it('checks the phone with the given rule on the trimmed value', () => {
    expect(validateParticipant({ ...valid, phone: ' 33 9 ' }, today, rules)).toEqual({});
    expect(validateParticipant({ ...valid, phone: '55 1234 5678' }, today, rules)).toEqual({
      phone: 'bad phone',
    });
  });

  it('applies the shared email, length, Instagram and birth date rules', () => {
    expect(
      validateParticipant(
        {
          ...valid,
          email: 'ana@ejemplo',
          city: 'a'.repeat(101),
          instagram: 'b girl',
          birthDate: '2026-10-09',
        },
        today,
        rules,
      ),
    ).toEqual({ email: 'bad mail', city: 'max 100', instagram: 'bad ig', birthDate: 'future' });
    expect(validateParticipant({ ...valid, birthDate: '2001-02-29' }, today, rules)).toEqual({
      birthDate: 'bad date',
    });
  });
});

describe('participantPayload', () => {
  it('trims text, omits blank optional fields and formats the phone with the given function', () => {
    expect(
      participantPayload({ ...valid, firstName: ' Ana ', city: '  ' }, (phone) => `+${phone}`),
    ).toEqual({
      firstName: 'Ana',
      firstLastName: 'López',
      email: 'ana@ejemplo.com',
      phone: '+33 1234 5678',
    });
  });

  it('keeps filled optional fields', () => {
    expect(
      participantPayload({ ...valid, stageName: ' B-Girl Ana ', birthDate: '2000-02-29' }, String),
    ).toMatchObject({ stageName: 'B-Girl Ana', birthDate: '2000-02-29' });
  });
});

describe('participant field rules', () => {
  it('accepts only real calendar dates', () => {
    expect(isCalendarDate('2000-02-29')).toBe(true);
    expect(isCalendarDate('2001-02-29')).toBe(false);
    expect(isCalendarDate('2000-13-01')).toBe(false);
    expect(isCalendarDate('29/02/2000')).toBe(false);
  });

  it('reads the Instagram handle without leading @', () => {
    expect(instagramHandle(' @@b.girl_ana ')).toBe('b.girl_ana');
    expect(instagramHandle('@')).toBe('');
  });

  it('strips phone separators but keeps other characters', () => {
    expect(stripPhoneSeparators('(33) 1234-56.78')).toBe('3312345678');
    expect(stripPhoneSeparators('+52 33')).toBe('+5233');
  });

  it('finds the first invalid field in form order', () => {
    expect(firstInvalidField({})).toBeNull();
    expect(firstInvalidField({ birthDate: 'x', phone: 'y', email: 'z' })).toBe('email');
  });
});
