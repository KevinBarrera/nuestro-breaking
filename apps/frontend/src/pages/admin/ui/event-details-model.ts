import type { AdminEvent, AdminEventFailure, UpdateEventInput } from '@/entities/admin-event';
import { fromZonedInput, toZonedInput } from '@/entities/event-catalog';
import { hasControlCharacters } from '@/shared/lib';
import {
  countryOptionsFor,
  NAME_MAX,
  timeZoneOptions,
  validateEventDetails,
  validateLocation,
  type EventDetailsDraft,
  type EventErrors,
} from './event-form-model';
import { eventFailureMessage } from './event-model';

// Pure form logic and Spanish copy for Datos del evento (#213 D2, D8). The editable fields
// follow the Nuevo evento rules; dates are `datetime-local` values on the selected zone's
// clock, so changing the zone keeps the typed times and moves the instants. An event created
// before the location (#322) shows empty fields with Mexico, and saves without one until the
// admin starts filling it in.

export function detailsDraft(event: AdminEvent): EventDetailsDraft {
  return {
    name: event.name,
    timeZone: event.timeZone,
    startsAt: event.startsAt ? toZonedInput(event.startsAt, event.timeZone) : '',
    endsAt: event.endsAt ? toZonedInput(event.endsAt, event.timeZone) : '',
    city: event.city ?? '',
    state: event.state ?? '',
    country: event.country ?? 'MX',
  };
}

const detailFields: (keyof EventDetailsDraft)[] = [
  'name',
  'timeZone',
  'startsAt',
  'endsAt',
  'city',
  'state',
  'country',
];

// The location is checked and sent once the event has one or the admin starts one: a city, a
// state or another country.
const withLocation = (event: AdminEvent, draft: EventDetailsDraft) =>
  event.city !== null ||
  draft.city.trim() !== '' ||
  draft.state.trim() !== '' ||
  draft.country !== detailsDraft(event).country;

// Whether the form holds edits: drives "Guardar cambios", "Descartar cambios" and the
// unsaved-changes guard.
export function isDetailsDirty(initial: EventDetailsDraft, draft: EventDetailsDraft): boolean {
  return detailFields.some((field) => initial[field] !== draft[field]);
}

// The short zone list, plus the stored zone first when the list lacks it (events created
// before #213, or through the API), so the current value stays selectable.
export function detailsZoneOptions(storedZone: string) {
  return timeZoneOptions.some((option) => option.id === storedZone)
    ? timeZoneOptions
    : [{ id: storedZone, label: storedZone }, ...timeZoneOptions];
}

export function validateDetails(event: AdminEvent, draft: EventDetailsDraft): EventErrors {
  const zones = detailsZoneOptions(event.timeZone).map((option) => option.id);
  const countries = countryOptionsFor(event.country).map((option) => option.id);
  return {
    ...validateEventDetails(draft, zones),
    ...(withLocation(event, draft) ? validateLocation(draft, countries) : {}),
  };
}

const instant = (value: string, timeZone: string) =>
  value ? fromZonedInput(value, timeZone) : null;

const sameInstant = (a: string | null, b: string | null) =>
  a === null || b === null ? a === b : Date.parse(a) === Date.parse(b);

// The `PATCH` body of a valid draft: only the fields that differ from the stored event.
export function detailsChanges(event: AdminEvent, draft: EventDetailsDraft): UpdateEventInput {
  const changes: UpdateEventInput = {};
  const name = draft.name.trim();
  if (name !== event.name) changes.name = name;
  if (draft.timeZone !== event.timeZone) changes.timeZone = draft.timeZone;
  const startsAt = instant(draft.startsAt, draft.timeZone);
  const endsAt = instant(draft.endsAt, draft.timeZone);
  if (!sameInstant(startsAt, event.startsAt)) changes.startsAt = startsAt;
  if (!sameInstant(endsAt, event.endsAt)) changes.endsAt = endsAt;
  if (withLocation(event, draft)) {
    const city = draft.city.trim();
    const state = draft.state.trim();
    if (city !== event.city) changes.city = city;
    if (state !== event.state) changes.state = state;
    if (draft.country !== event.country) changes.country = draft.country;
  }
  return changes;
}

export const savedNotice = 'Cambios guardados.';

// Global admins restore it on this page ("Archivar o eliminar") or from the event list.
export const archivedNotice = (canRestore: boolean) =>
  canRestore
    ? 'Este evento está archivado, así que sus datos no se pueden editar. Restáuralo abajo, en «Archivar o eliminar», para cambiarlos.'
    : 'Este evento está archivado, así que sus datos no se pueden editar. Pide a un administrador general que lo restaure.';

export const readOnlyNotice =
  'Solo lectura: tu cuenta puede ver los datos de este evento, pero no cambiarlos.';

export const unknownSaveMessage =
  'No pudimos confirmar si los cambios se guardaron. Recarga la página para revisarlo.';

// Venue names follow the backend rule (`venue-input.ts`): the event name rule.
export function validateVenueName(name: string): string | undefined {
  if (hasControlCharacters(name)) return 'Quita los caracteres especiales del nombre.';
  const trimmed = name.trim();
  if (!trimmed) return 'Escribe el nombre de la sede.';
  if (trimmed.length > NAME_MAX) return `Usa ${NAME_MAX} caracteres o menos.`;
  return undefined;
}

export function venueFailureMessage(failure: AdminEventFailure): string {
  if (failure.kind === 'invalid') return 'Revisa el nombre de la sede.';
  if (failure.kind === 'not_found')
    return 'No encontramos esta sede en el evento. Recarga la página.';
  if (failure.kind === 'unknown')
    return 'No pudimos confirmar si el cambio se guardó. Recarga la página para revisarlo.';
  return eventFailureMessage(failure);
}
