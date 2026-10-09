import type { RegistrationBuyer } from '@/entities/public-event';

// The Tus datos form as typed. `phone` holds the 10-digit national number; the UI shows a fixed
// +52 prefix and `buyerPayload` adds it.
export type BuyerForm = {
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

export type BuyerField = keyof BuyerForm;
export type BuyerErrors = Partial<Record<BuyerField, string>>;

export const buyerFields = [
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
] as const satisfies readonly BuyerField[];

export const emptyBuyerForm: BuyerForm = {
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
export const buyerMaxLength: Partial<Record<BuyerField, number>> = {
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
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_BIRTH_DATE = '1900-01-01';
const PHONE_SEPARATORS = /[\s().-]/g;

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

// A real calendar date: `2001-02-29` and `2000-13-01` are rejected.
function isCalendarDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const instagramHandle = (value: string) => value.trim().replace(/^@+/, '').trim();

function fieldError(field: BuyerField, raw: string, today: string): string | null {
  const value = raw.trim();
  if (!value) return buyerMessages.required[field] ?? null;
  const max = buyerMaxLength[field];
  if (max !== undefined && value.length > max) return buyerMessages.tooLong(max);
  if (field === 'email' && !EMAIL.test(value)) return buyerMessages.invalid.email;
  if (field === 'phone' && !/^\d{10}$/.test(value.replace(PHONE_SEPARATORS, '')))
    return buyerMessages.invalid.phone;
  if (field === 'instagram') {
    const handle = instagramHandle(value);
    if (!handle || /\s/.test(handle)) return buyerMessages.invalid.instagram;
  }
  if (field === 'birthDate') {
    if (!isCalendarDate(value) || value < MIN_BIRTH_DATE) return buyerMessages.invalid.birthDate;
    if (value > today) return buyerMessages.inFuture;
  }
  return null;
}

/** Spanish inline errors per field; empty when the form can be sent. `today` is `YYYY-MM-DD`. */
export function validateBuyer(form: BuyerForm, today: string): BuyerErrors {
  const errors: BuyerErrors = {};
  for (const field of buyerFields) {
    const message = fieldError(field, form[field], today);
    if (message) errors[field] = message;
  }
  return errors;
}

// The request's buyer: trimmed text, blank optional fields omitted, phone with the +52 prefix.
export function buyerPayload(form: BuyerForm): RegistrationBuyer {
  const buyer: RegistrationBuyer = {
    firstName: form.firstName.trim(),
    firstLastName: form.firstLastName.trim(),
    email: form.email.trim(),
    phone: `+52 ${form.phone.replace(PHONE_SEPARATORS, '')}`,
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
    if (value) buyer[field] = value;
  }
  return buyer;
}

// The fields inside the collapsed "Más datos (opcional)" block of Tus datos.
export const optionalDetailFields = [
  'city',
  'instagram',
  'level',
  'birthDate',
] as const satisfies readonly BuyerField[];

// The field to focus after a failed submit: the first invalid one in form order.
export function firstInvalidField(errors: BuyerErrors): BuyerField | null {
  return buyerFields.find((field) => errors[field]) ?? null;
}

// Whether the collapsed details block must open to show an error.
export const detailsHaveError = (errors: BuyerErrors) =>
  optionalDetailFields.some((field) => errors[field]);

// The browser's calendar day as `YYYY-MM-DD`, the `today` that `validateBuyer` expects.
export function localIsoDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
