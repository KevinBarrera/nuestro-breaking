import { stripPhoneSeparators } from './participant-form';

// How a form takes the participant's phone, shared by the public Tus datos form (#390) and the
// admin in-person sale (#105): `mx` is the 10-digit national number behind a fixed +52;
// `international` is the full number with its country code, 10 to 15 digits as the backend
// accepts. Each form keeps its own copy for the error message.
export const phoneModes = ['mx', 'international'] as const;
export type PhoneMode = (typeof phoneModes)[number];
export const defaultPhoneMode: PhoneMode = 'mx';

export const isPhoneMode = (value: unknown): value is PhoneMode =>
  phoneModes.some((mode) => mode === value);

const PHONE_RULES: Record<
  PhoneMode,
  { isValid: (phone: string) => boolean; format: (phone: string) => string }
> = {
  mx: {
    isValid: (phone) => /^\d{10}$/.test(stripPhoneSeparators(phone)),
    format: (phone) => `+52 ${stripPhoneSeparators(phone)}`,
  },
  // An optional leading +, then digits and separators only.
  international: {
    isValid: (phone) => /^\+?\d{10,15}$/.test(stripPhoneSeparators(phone)),
    format: (phone) => `+${phone.replace(/\D/g, '')}`,
  },
};

/** Whether the phone, as typed, fits the mode. */
export const phoneIsValid = (mode: PhoneMode, phone: string) => PHONE_RULES[mode].isValid(phone);

/** The phone as the backend receives it: `+52 <digits>` in Mexican mode, `+<digits>` otherwise. */
export const formatPhone = (mode: PhoneMode, phone: string) => PHONE_RULES[mode].format(phone);
