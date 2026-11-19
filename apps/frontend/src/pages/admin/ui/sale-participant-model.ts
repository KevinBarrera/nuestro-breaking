import type { ManualRegistrationInput } from '@/entities/admin-registration';
import {
  defaultPhoneMode,
  formatPhone,
  participantPayload,
  phoneIsValid,
  validateParticipant,
  type PhoneMode,
  type ParticipantErrors,
  type ParticipantForm,
  type ParticipantMessages,
} from '@/entities/participant';

// How the operator types the participant's phone in the in-person sale (#105). The modes and
// their rules are shared with the public form (`entities/participant`); the copy is the operator's.
export type SalePhoneMode = PhoneMode;
export const defaultSalePhoneMode: SalePhoneMode = defaultPhoneMode;

const phoneMessages: Record<SalePhoneMode, string> = {
  mx: 'Escribe los 10 dígitos del celular.',
  international: 'Escribe el número completo con clave de país, de 10 a 15 dígitos.',
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
    phone: phoneMessages[mode],
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
    phoneIsValid: (phone) => phoneIsValid(mode, phone),
  });
}

// The manual registration body: `+52 <digits>` in Mexican mode, `+<digits>` otherwise.
export function saleParticipantPayload(
  form: ParticipantForm,
  mode: SalePhoneMode = defaultSalePhoneMode,
): ManualRegistrationInput {
  return participantPayload(form, (phone) => formatPhone(mode, phone));
}
