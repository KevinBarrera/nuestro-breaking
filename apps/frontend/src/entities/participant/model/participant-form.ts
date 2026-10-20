// The #58 participant fields as typed in a form, shared by the public Tus datos form and the
// admin in-person sale. Copy and the phone rule are left to each form.
export type ParticipantForm = {
  firstName: string;
  firstLastName: string;
  secondLastName: string;
  stageName: string;
  email: string;
  phone: string;
  city: string;
  instagram: string;
  level: string;
  birthDate: string;
};

export type ParticipantField = keyof ParticipantForm;
export type ParticipantErrors = Partial<Record<ParticipantField, string>>;

// The participant as sent: trimmed text, blank optional fields omitted.
export type ParticipantPayload = {
  firstName: string;
  firstLastName: string;
  secondLastName?: string;
  stageName?: string;
  email: string;
  phone: string;
  city?: string;
  instagram?: string;
  level?: string;
  birthDate?: string;
};

export const participantFields = [
  'firstName',
  'firstLastName',
  'secondLastName',
  'stageName',
  'email',
  'phone',
  'city',
  'instagram',
  'level',
  'birthDate',
] as const satisfies readonly ParticipantField[];

export const emptyParticipantForm: ParticipantForm = {
  firstName: '',
  firstLastName: '',
  secondLastName: '',
  stageName: '',
  email: '',
  phone: '',
  city: '',
  instagram: '',
  level: '',
  birthDate: '',
};

// Limits mirror `parsePublicRegistrationRequest` in the backend (`public-registration-request.ts`).
export const participantMaxLength: Partial<Record<ParticipantField, number>> = {
  firstName: 100,
  firstLastName: 100,
  secondLastName: 100,
  stageName: 100,
  email: 254,
  phone: 30,
  city: 100,
  instagram: 64,
  level: 50,
};
// The form labels, also used to name fields in error summaries.
export const participantFieldLabels: Record<ParticipantField, string> = {
  firstName: 'Nombre(s)',
  firstLastName: 'Primer apellido',
  secondLastName: 'Segundo',
  stageName: 'AKA / nombre artístico',
  email: 'Correo electrónico',
  phone: 'Teléfono celular',
  city: 'Ciudad',
  instagram: 'Instagram',
  level: 'Nivel',
  birthDate: 'Fecha de nacimiento',
};

// The fields inside the collapsed "Más datos (opcional)" block.
export const optionalDetailFields = [
  'city',
  'instagram',
  'level',
  'birthDate',
] as const satisfies readonly ParticipantField[];

// The Spanish copy of a form; only fields listed in `required` must be filled.
export type ParticipantMessages = {
  required: Partial<Record<ParticipantField, string>>;
  invalid: { email: string; phone: string; instagram: string; birthDate: string };
  tooLong: (max: number) => string;
  inFuture: string;
};

export type ParticipantRules = {
  messages: ParticipantMessages;
  // Receives the trimmed, non-empty phone as typed.
  phoneIsValid: (phone: string) => boolean;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_BIRTH_DATE = '1900-01-01';
const PHONE_SEPARATORS = /[\s().-]/g;

// The phone without the separators a person types: space, parentheses, dot and hyphen.
export const stripPhoneSeparators = (phone: string) => phone.replace(PHONE_SEPARATORS, '');

// A real calendar date: `2001-02-29` and `2000-13-01` are rejected.
export function isCalendarDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export const instagramHandle = (value: string) => value.trim().replace(/^@+/, '').trim();

function fieldError(
  field: ParticipantField,
  raw: string,
  today: string,
  { messages, phoneIsValid }: ParticipantRules,
): string | null {
  const value = raw.trim();
  if (!value) return messages.required[field] ?? null;
  const max = participantMaxLength[field];
  if (max !== undefined && value.length > max) return messages.tooLong(max);
  if (field === 'email' && !EMAIL.test(value)) return messages.invalid.email;
  if (field === 'phone' && !phoneIsValid(value)) return messages.invalid.phone;
  if (field === 'instagram') {
    const handle = instagramHandle(value);
    if (!handle || /\s/.test(handle)) return messages.invalid.instagram;
  }
  if (field === 'birthDate') {
    if (!isCalendarDate(value) || value < MIN_BIRTH_DATE) return messages.invalid.birthDate;
    if (value > today) return messages.inFuture;
  }
  return null;
}

/** Inline errors per field; empty when the form can be sent. `today` is `YYYY-MM-DD`. */
export function validateParticipant(
  form: ParticipantForm,
  today: string,
  rules: ParticipantRules,
): ParticipantErrors {
  const errors: ParticipantErrors = {};
  for (const field of participantFields) {
    const message = fieldError(field, form[field], today, rules);
    if (message) errors[field] = message;
  }
  return errors;
}

// Trimmed text with blank optional fields omitted; `formatPhone` receives the phone as typed.
export function participantPayload(
  form: ParticipantForm,
  formatPhone: (phone: string) => string,
): ParticipantPayload {
  const payload: ParticipantPayload = {
    firstName: form.firstName.trim(),
    firstLastName: form.firstLastName.trim(),
    email: form.email.trim(),
    phone: formatPhone(form.phone),
  };
  for (const field of [
    'secondLastName',
    'stageName',
    'city',
    'instagram',
    'level',
    'birthDate',
  ] as const) {
    const value = form[field].trim();
    if (value) payload[field] = value;
  }
  return payload;
}

// The field to focus after a failed submit: the first invalid one in form order.
export function firstInvalidField(errors: ParticipantErrors): ParticipantField | null {
  return participantFields.find((field) => errors[field]) ?? null;
}

// Whether the collapsed details block must open to show an error.
export const detailsHaveError = (errors: ParticipantErrors) =>
  optionalDetailFields.some((field) => errors[field]);

// The browser's calendar day as `YYYY-MM-DD`, the `today` that validation expects.
export function localIsoDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
