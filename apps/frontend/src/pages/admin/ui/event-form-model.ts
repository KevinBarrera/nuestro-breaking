import type { CreateEventInput } from '@/entities/admin-event';
import { fromZonedInput } from '@/entities/event-catalog';
import { hasControlCharacters } from '@/shared/lib';

// Pure form logic and Spanish messages for Nuevo evento (#213). The rules mirror the backend
// (`admin-event-input.ts`), so most mistakes show before a request.

export const NAME_MAX = 120;
export const SLUG_MAX = 80;
export const FOLIO_PREFIX_MIN = 2;
export const FOLIO_PREFIX_MAX = 6;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FOLIO_PREFIX_PATTERN = new RegExp(
  `^[A-Z][A-Z0-9]{${FOLIO_PREFIX_MIN - 1},${FOLIO_PREFIX_MAX - 1}}$`,
);

// A short curated list; the backend accepts any IANA zone.
export const timeZoneOptions = [
  { id: 'America/Mexico_City', label: 'Ciudad de México (America/Mexico_City)' },
  { id: 'America/Monterrey', label: 'Monterrey (America/Monterrey)' },
  { id: 'America/Cancun', label: 'Cancún (America/Cancun)' },
  { id: 'America/Merida', label: 'Mérida (America/Merida)' },
  { id: 'America/Chihuahua', label: 'Chihuahua (America/Chihuahua)' },
  { id: 'America/Mazatlan', label: 'Mazatlán (America/Mazatlan)' },
  { id: 'America/Hermosillo', label: 'Hermosillo (America/Hermosillo)' },
  { id: 'America/Tijuana', label: 'Tijuana (America/Tijuana)' },
];

// Dates are `datetime-local` values on the chosen zone's clock, empty when not set.
export type EventDraft = {
  name: string;
  slug: string;
  folioPrefix: string;
  timeZone: string;
  startsAt: string;
  endsAt: string;
};

export const emptyEventDraft: EventDraft = {
  name: '',
  slug: '',
  folioPrefix: '',
  timeZone: 'America/Mexico_City',
  startsAt: '',
  endsAt: '',
};

export type EventField = keyof EventDraft;
export type EventErrors = Partial<Record<EventField, string>>;

// The address suggested from the name: lowercase, no accents, other characters become single
// hyphens, at most `SLUG_MAX` characters.
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '');
}

export const previewUrl = (origin: string, slug: string) => `${origin}/e/${slug || '…'}`;

// A folio as a confirmed registration gets it: the prefix, then a four-character code.
export const sampleFolio = (prefix: string) => `${prefix || '…'}-7K3Q`;

const messages = {
  nameMissing: 'Escribe el nombre del evento.',
  nameLong: `Usa ${NAME_MAX} caracteres o menos.`,
  nameControl: 'Quita los caracteres especiales del nombre.',
  slugMissing: 'Escribe la dirección.',
  slugInvalid: `Usa solo minúsculas, números y guiones, hasta ${SLUG_MAX} caracteres.`,
  slugTaken: 'Esta dirección ya la usa otro evento. Elige otra.',
  prefix: `Usa de ${FOLIO_PREFIX_MIN} a ${FOLIO_PREFIX_MAX} letras mayúsculas o números, empezando con una letra.`,
  timeZone: 'Elige una zona horaria de la lista.',
  startMissing: 'Escribe también la fecha de inicio.',
  endMissing: 'Escribe también la fecha de fin.',
  order: 'El fin debe ser después del inicio.',
  skipped: 'Esa hora no existe en la zona horaria elegida. Elige otra.',
};

// Shared with `eventFailureMessage`, so the field and the page alert never disagree.
export const slugTakenMessage = messages.slugTaken;

// Field hints on the event forms, built from the same limits as the validation.
export const slugHint = `Se sugiere a partir del nombre. Solo minúsculas, números y guiones, hasta ${SLUG_MAX} caracteres. No se puede cambiar después de crear el evento.`;
export const folioPrefixHint = `De ${FOLIO_PREFIX_MIN} a ${FOLIO_PREFIX_MAX} caracteres; empieza con letra. No se puede cambiar después.`;

function nameError(name: string): string | undefined {
  if (hasControlCharacters(name)) return messages.nameControl;
  const trimmed = name.trim();
  if (!trimmed) return messages.nameMissing;
  if (trimmed.length > NAME_MAX) return messages.nameLong;
  return undefined;
}

// The fields that stay editable after creation (Datos del evento uses the same rules).
export type EventDetailsDraft = Pick<EventDraft, 'name' | 'timeZone' | 'startsAt' | 'endsAt'>;

// Name, time zone and dates. `allowedZones` is the zone list on screen; Datos del evento adds
// the stored zone when it is not in the short list.
export function validateEventDetails(
  draft: EventDetailsDraft,
  allowedZones: readonly string[] = timeZoneOptions.map((option) => option.id),
): EventErrors {
  const errors: EventErrors = {};
  const name = nameError(draft.name);
  if (name) errors.name = name;
  if (!allowedZones.includes(draft.timeZone)) errors.timeZone = messages.timeZone;
  const startsAt = draft.startsAt ? fromZonedInput(draft.startsAt, draft.timeZone) : null;
  const endsAt = draft.endsAt ? fromZonedInput(draft.endsAt, draft.timeZone) : null;
  if (draft.startsAt && !startsAt) errors.startsAt = messages.skipped;
  if (draft.endsAt && !endsAt) errors.endsAt = messages.skipped;
  if (draft.startsAt && !draft.endsAt) errors.endsAt = messages.endMissing;
  if (draft.endsAt && !draft.startsAt) errors.startsAt = messages.startMissing;
  if (startsAt && endsAt && Date.parse(startsAt) >= Date.parse(endsAt))
    errors.endsAt = messages.order;
  return errors;
}

export function validateEvent(draft: EventDraft): EventErrors {
  const errors = validateEventDetails(draft);
  if (!draft.slug) errors.slug = messages.slugMissing;
  else if (draft.slug.length > SLUG_MAX || !SLUG_PATTERN.test(draft.slug))
    errors.slug = messages.slugInvalid;
  if (!FOLIO_PREFIX_PATTERN.test(draft.folioPrefix)) errors.folioPrefix = messages.prefix;
  return errors;
}

// The `POST /admin/events` body of a valid draft.
export function createInput(draft: EventDraft): CreateEventInput {
  return {
    name: draft.name.trim(),
    slug: draft.slug,
    folioPrefix: draft.folioPrefix,
    timeZone: draft.timeZone,
    startsAt: draft.startsAt ? fromZonedInput(draft.startsAt, draft.timeZone) : null,
    endsAt: draft.endsAt ? fromZonedInput(draft.endsAt, draft.timeZone) : null,
  };
}

// The backend's 400 `fieldErrors` (and the 409 `slug_taken`) hold codes, never the values.
export function eventServerErrors(fieldErrors: Record<string, string>): EventErrors {
  const errors: EventErrors = {};
  if (fieldErrors.name) errors.name = 'Revisa el nombre.';
  if (fieldErrors.slug)
    errors.slug = fieldErrors.slug === 'taken' ? messages.slugTaken : messages.slugInvalid;
  if (fieldErrors.folioPrefix) errors.folioPrefix = messages.prefix;
  if (fieldErrors.timeZone) errors.timeZone = messages.timeZone;
  if (fieldErrors.startsAt) errors.startsAt = 'Revisa la fecha de inicio.';
  if (fieldErrors.endsAt) errors.endsAt = 'Revisa la fecha de fin: debe ser después del inicio.';
  return errors;
}

// Field order on the screen, to focus the first error.
export const eventFieldOrder: EventField[] = [
  'name',
  'slug',
  'folioPrefix',
  'timeZone',
  'startsAt',
  'endsAt',
];
