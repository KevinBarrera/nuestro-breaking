import {
  detailsHaveError,
  emptyParticipantForm,
  firstInvalidField,
  localIsoDate,
  optionalDetailFields,
  participantFieldLabels,
  participantFields,
  participantMaxLength,
  participantPayload,
  stripPhoneSeparators,
  validateParticipant,
  type ParticipantErrors,
  type ParticipantField,
  type ParticipantForm,
} from '@/entities/participant';
import type { RegistrationBuyer } from '@/entities/public-event';

// The Tus datos form as typed, in the buyer's voice over the shared participant model.
// `phone` holds the 10-digit national number; the UI shows a fixed +52 prefix and
// `buyerPayload` adds it.
export type BuyerForm = ParticipantForm;
export type BuyerField = ParticipantField;
export type BuyerErrors = ParticipantErrors;

export const buyerFields = participantFields;
export const emptyBuyerForm: BuyerForm = emptyParticipantForm;
export const buyerMaxLength = participantMaxLength;
export const buyerFieldLabels = participantFieldLabels;

export const buyerMessages = {
  required: {
    firstName: 'Escribe tu nombre.',
    firstLastName: 'Escribe tu primer apellido.',
    email: 'Escribe tu correo electrónico.',
    phone: 'Escribe tu teléfono celular.',
  } as Partial<Record<BuyerField, string>>,
  invalid: {
    email: 'Escribe un correo válido, por ejemplo nombre@correo.com.',
    phone: 'Escribe los 10 dígitos de tu celular.',
    instagram: 'Escribe tu usuario sin espacios.',
    birthDate: 'Escribe una fecha válida.',
  } as const,
  tooLong: (max: number) => `Usa máximo ${max} caracteres.`,
  inFuture: 'La fecha no puede ser futura.',
  fallback: 'Revisa este dato.',
};

const isNationalPhone = (phone: string) => /^\d{10}$/.test(stripPhoneSeparators(phone));

/** Spanish inline errors per field; empty when the form can be sent. `today` is `YYYY-MM-DD`. */
export function validateBuyer(form: BuyerForm, today: string): BuyerErrors {
  return validateParticipant(form, today, {
    messages: buyerMessages,
    phoneIsValid: isNationalPhone,
  });
}

// The request's buyer: trimmed text, blank optional fields omitted, phone with the +52 prefix.
export function buyerPayload(form: BuyerForm): RegistrationBuyer {
  return participantPayload(form, (phone) => `+52 ${stripPhoneSeparators(phone)}`);
}

// The phone as the buyer reads it: `+52 33 1234 5678` for ten digits, else as typed after +52.
export function displayPhone(phone: string): string {
  const digits = stripPhoneSeparators(phone);
  return /^\d{10}$/.test(digits)
    ? `+52 ${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`
    : `+52 ${phone.trim()}`;
}

export { detailsHaveError, firstInvalidField, localIsoDate, optionalDetailFields };
