import {
  detailsHaveError,
  emptyParticipantForm,
  firstInvalidField,
  localIsoDate,
  optionalDetailFields,
  participantFieldLabels,
  participantFields,
  participantMaxLength,
  defaultPhoneMode,
  formatPhone,
  participantPayload,
  phoneIsValid,
  stripPhoneSeparators,
  validateParticipant,
  type PhoneMode,
  type ParticipantErrors,
  type ParticipantField,
  type ParticipantForm,
} from '@/entities/participant';
import type { RegistrationBuyer } from '@/entities/public-event';

// The Tus datos form as typed, in the buyer's voice over the shared participant model.
// `phoneMode` says how `phone` was typed (#390): `mx` is the 10-digit national number behind a
// fixed +52 that `buyerPayload` adds; `international` is the full number with its country code.
export type BuyerForm = ParticipantForm & { phoneMode: PhoneMode };
export type BuyerField = ParticipantField;
export type BuyerErrors = ParticipantErrors;

export const buyerFields = participantFields;
export const emptyBuyerForm: BuyerForm = { ...emptyParticipantForm, phoneMode: defaultPhoneMode };
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

// The invalid phone message for each mode, for the client check and server `fieldErrors` alike;
// `buyerMessages` keeps the Mexican one.
export const invalidPhoneMessages: Record<PhoneMode, string> = {
  mx: buyerMessages.invalid.phone,
  international: 'Escribe tu número completo con la lada de tu país, de 10 a 15 dígitos.',
};

/** Spanish inline errors per field; empty when the form can be sent. `today` is `YYYY-MM-DD`. */
export function validateBuyer(form: BuyerForm, today: string): BuyerErrors {
  const mode = form.phoneMode;
  return validateParticipant(form, today, {
    messages: {
      ...buyerMessages,
      invalid: { ...buyerMessages.invalid, phone: invalidPhoneMessages[mode] },
    },
    phoneIsValid: (phone) => phoneIsValid(mode, phone),
  });
}

// The request's buyer: trimmed text, blank optional fields omitted, phone as `+52 <digits>` in
// Mexican mode or `+<digits>` for another country.
export function buyerPayload(form: BuyerForm): RegistrationBuyer {
  return participantPayload(form, (phone) => formatPhone(form.phoneMode, phone));
}

// The phone as the buyer reads it: `+52 33 1234 5678` for ten Mexican digits, else as typed after
// +52; a number from another country as it is sent, `+<digits>`.
export function displayPhone(phone: string, mode: PhoneMode = defaultPhoneMode): string {
  if (mode === 'international') return formatPhone(mode, phone);
  const digits = stripPhoneSeparators(phone);
  return /^\d{10}$/.test(digits)
    ? `+52 ${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`
    : `+52 ${phone.trim()}`;
}

export { detailsHaveError, firstInvalidField, localIsoDate, optionalDetailFields };
