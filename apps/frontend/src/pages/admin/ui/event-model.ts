import type { AdminEventErrorCode, AdminEventFailure, AdminEvent } from '@/entities/admin-event';
import { countryLabel, slugTakenMessage, timeZoneOptions } from './event-form-model';

// Pure logic and Spanish copy for the event list (#213).

export function splitEvents(events: AdminEvent[]) {
  return {
    active: events.filter((event) => event.archivedAt === null),
    archived: events.filter((event) => event.archivedAt !== null),
  };
}

// With exactly one active event there is nothing to choose, so the landing opens it. Global
// admins always see the list: it holds "Crear evento" and the archived events, and a redirect
// would hide both.
export function landingRedirect(active: AdminEvent[], canManageEvents: boolean): string | null {
  return !canManageEvents && active.length === 1 ? active[0].id : null;
}

// The event's days on its own clock, e.g. "14–15 de noviembre de 2026"; `formatRange`
// collapses the shared month and year, and a one-day event shows a single date.
export function eventDates(event: Pick<AdminEvent, 'startsAt' | 'endsAt' | 'timeZone'>): string {
  if (!event.startsAt || !event.endsAt) return 'Fechas por definir';
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: event.timeZone,
  }).formatRange(new Date(event.startsAt), new Date(event.endsAt));
}

// The city of a zone from the Nuevo evento list, or the zone id for any other zone.
export function eventZoneName(timeZone: string): string {
  const option = timeZoneOptions.find((candidate) => candidate.id === timeZone);
  return option ? option.label.replace(/ \(.*\)$/, '') : timeZone;
}

// Where the event happens (#322): the city and its state, then the country outside Mexico. The
// state is left out when it repeats the city ("Ciudad de México"). Null without a location, so
// the screens hide the line instead of showing the time zone.
export function eventLocation(
  event: Pick<AdminEvent, 'city' | 'state' | 'country'>,
): string | null {
  const { city, state, country } = event;
  if (!city || !state || !country) return null;
  const parts = [city];
  if (state.localeCompare(city, 'es', { sensitivity: 'base' }) !== 0) parts.push(state);
  if (country !== 'MX') parts.push(countryLabel(country));
  return parts.join(', ');
}

// The card chip follows the sales switch only: the list does not carry the sales window, so
// an event with sales on but outside its window still reads "Venta abierta" here. The event
// overview shows the exact state.
export type SalesChip = { label: 'Venta abierta' | 'Venta cerrada'; tone: 'open' | 'closed' };

export function salesChip(salesEnabled: boolean): SalesChip {
  return salesEnabled
    ? { label: 'Venta abierta', tone: 'open' }
    : { label: 'Venta cerrada', tone: 'closed' };
}

export const folioPattern = (prefix: string) => `${prefix}-····`;

export const restoredNotice = (name: string) =>
  `«${name}» volvió a la lista de eventos. La venta en línea sigue cerrada: ábrela desde el resumen del evento cuando esté lista.`;

const ruleMessages: Record<AdminEventErrorCode, string> = {
  slug_taken: slugTakenMessage,
  organization_ambiguous:
    'No se puede crear el evento: hay más de una organización registrada. Pide ayuda a soporte.',
  event_archived: 'Este evento está archivado. Restáuralo primero.',
  event_not_archived: 'Este evento ya no está archivado. Recarga la lista.',
  venue_shared: 'Esta sede también la usa otro evento, así que no se puede renombrar desde aquí.',
};

export function eventFailureMessage(failure: AdminEventFailure): string {
  switch (failure.kind) {
    case 'unauthorized':
    case 'forbidden':
      return 'Tu sesión terminó o ya no tienes acceso para hacer esto. Vuelve a iniciar sesión.';
    case 'invalid':
      return 'Revisa los datos e inténtalo de nuevo.';
    case 'rule':
      return ruleMessages[failure.code];
    case 'not_empty':
      return 'Este evento ya tiene datos, así que no se puede eliminar. Archívalo en su lugar.';
    case 'not_found':
      return 'Este evento ya no existe. Recarga la lista.';
    case 'unknown':
      return 'No pudimos confirmar si el cambio se guardó. Recarga la lista para revisarlo.';
    case 'error':
      return 'No se pudo completar la operación. Inténtalo de nuevo.';
  }
}
