import type { ManualRegistrationInput } from '@/entities/admin-registration';
import {
  participantPayload,
  stripPhoneSeparators,
  validateParticipant,
  type ParticipantErrors,
  type ParticipantForm,
  type ParticipantMessages,
} from '@/entities/participant';

// How the operator types the participant's phone in the in-person sale (#105): `mx` is the
// 10-digit national number behind a fixed +52, as in the public form; `international` is the
// full number with its country code, 10 to 15 digits as the backend accepts.
export const salePhoneModes = ['mx', 'international'] as const;
export type SalePhoneMode = (typeof salePhoneModes)[number];
export const defaultSalePhoneMode: SalePhoneMode = 'mx';

const PHONE_RULES: Record<
  SalePhoneMode,
  { isValid: (phone: string) => boolean; format: (phone: string) => string; message: string }
> = {
  mx: {
    isValid: (phone) => /^\d{10}$/.test(stripPhoneSeparators(phone)),
    format: (phone) => `+52 ${stripPhoneSeparators(phone)}`,
    message: 'Escribe los 10 dígitos del celular.',
  },
  // An optional leading +, then digits and separators only.
  international: {
    isValid: (phone) => /^\+?\d{10,15}$/.test(stripPhoneSeparators(phone)),
    format: (phone) => `+${phone.replace(/\D/g, '')}`,
    message: 'Escribe el número completo con clave de país, de 10 a 15 dígitos.',
  },
};

// The operator's copy, about the participant rather than addressed to them. Server field errors
// reuse it (`registration-model.ts`), so a server answer reads like the client check.
export const saleParticipantMessages = (mode: SalePhoneMode): ParticipantMessages => ({
  required: {
    firstName: 'Escribe el nombre.',
    firstLastName: 'Escribe el primer apellido.',
    email: 'Escribe el correo del participante.',
    phone: 'Escribe el teléfono celular.',
  },
  invalid: {
    email: 'Escribe un correo válido, por ejemplo nombre@correo.com.',
    phone: PHONE_RULES[mode].message,
    instagram: 'Escribe el usuario sin espacios.',
    birthDate: 'Escribe una fecha válida.',
  },
  tooLong: (max) => `Usa máximo ${max} caracteres.`,
  inFuture: 'La fecha no puede ser futura.',
});

/** Spanish inline errors per field; empty when the form can be sent. `today` is `YYYY-MM-DD`. */
export function validateSaleParticipant(
  form: ParticipantForm,
  today: string,
  mode: SalePhoneMode = defaultSalePhoneMode,
): ParticipantErrors {
  return validateParticipant(form, today, {
    messages: saleParticipantMessages(mode),
    phoneIsValid: PHONE_RULES[mode].isValid,
  });
}

// The manual registration body: `+52 <digits>` in Mexican mode, `+<digits>` otherwise.
export function saleParticipantPayload(
  form: ParticipantForm,
  mode: SalePhoneMode = defaultSalePhoneMode,
): ManualRegistrationInput {
  return participantPayload(form, PHONE_RULES[mode].format);
}
