import type { AdminEventFailure, EventDeleteBlocker } from '@/entities/admin-event';
import { eventFailureMessage } from './event-model';

// Copy and rules of "Archivar o eliminar" on Datos del evento (#213 T10).

const blockerWords: Record<EventDeleteBlocker, string> = {
  activities: 'actividades',
  passTypes: 'pases',
  registrations: 'inscripciones',
  checkIns: 'check-ins',
  catalogAudit: 'historial de cambios del catálogo',
  registrationAudit: 'historial de inscripciones',
};

// «y» becomes «e» before an /i/ sound ("pases e inscripciones").
const conjunction = (word: string) => (/^h?i[^aeiouáéíóú]/i.test(word) ? 'e' : 'y');

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join('');
  const last = words[words.length - 1];
  return `${words.slice(0, -1).join(', ')} ${conjunction(last)} ${last}`;
}

export const blockerList = (blockers: EventDeleteBlocker[]) =>
  joinWords(blockers.map((blocker) => blockerWords[blocker]));

// Why "Eliminar evento" is disabled. Without the blockers (a refusal that named none), it
// stays general.
export const deleteUnavailableReason = (blockers: EventDeleteBlocker[]) =>
  `No disponible: este evento ya tiene ${blockers.length > 0 ? blockerList(blockers) : 'datos'}. Solo se elimina un evento vacío, por ejemplo uno creado por error. Para quitarlo de la operación, archívalo.`;

// Whether "Eliminar evento" works. A `409 event_not_empty` always means it does not, even when
// the refusal named only kinds this panel does not know (then the reason says "datos").
export type DeleteAvailability =
  { kind: 'available' } | { kind: 'unknown' } | { kind: 'blocked'; reason: string };

export function deleteAvailability(
  blockers: EventDeleteBlocker[] | null,
  refused: boolean,
): DeleteAvailability {
  if (refused || (blockers !== null && blockers.length > 0))
    return { kind: 'blocked', reason: deleteUnavailableReason(blockers ?? []) };
  return blockers === null ? { kind: 'unknown' } : { kind: 'available' };
}

export const deleteAvailableHint =
  'Solo para un evento vacío, por ejemplo uno creado por error. No se puede deshacer.';

// The foundation did not say whether the event is empty: the API decides on delete.
export const deleteUnknownHint =
  'Solo se elimina un evento vacío, por ejemplo uno creado por error. Si ya tiene actividades, pases o inscripciones, archívalo.';

export const archiveHint =
  'Cierra la venta y lo quita del selector y de la página pública. Inscripciones, pagos y folios se conservan, y se puede restaurar.';

export const restoreHint =
  'Vuelve a la lista de eventos y al selector. La venta en línea sigue cerrada hasta que la abras desde el resumen del evento.';

export const archiveConsequences = [
  'La venta en línea se cierra y la página de compra deja de estar disponible.',
  'Desaparece del selector de eventos y queda en «Archivados».',
  'Inscripciones, pagos, folios y check-ins se conservan y se pueden consultar.',
  'Los pagos que Mercado Pago confirme después se siguen registrando.',
  'Puedes restaurarlo cuando quieras. La venta queda cerrada hasta que la abras de nuevo.',
] as const;

export const archivedListNotice = (name: string) =>
  `«${name}» se archivó. La venta en línea quedó cerrada y lo encuentras en «Archivados».`;

export const restoredHereNotice =
  'Evento restaurado. La venta en línea sigue cerrada: ábrela desde el resumen del evento cuando esté lista.';

export const deletedNotice = (name: string) =>
  `Evento eliminado: «${name}» ya no existe y su dirección quedó libre.`;

export const deleteUnknownNotice = (name: string) =>
  `No pudimos confirmar si «${name}» se eliminó. Revisa si sigue en la lista.`;

// The API compares the slug exactly (no trimming or case folding), so the button does too.
export const slugConfirmed = (typed: string, slug: string) => typed === slug;

export function deleteFailureMessage(failure: AdminEventFailure): string {
  if (failure.kind === 'invalid')
    return 'La dirección no coincide. Escríbela tal como aparece arriba.';
  if (failure.kind === 'not_found')
    return 'Este evento ya no existe. Vuelve a la lista de eventos.';
  return eventFailureMessage(failure);
}

// The event list shows a notice another screen left in the navigation state.
export function listNotice(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('notice' in state)) return null;
  const { notice } = state;
  return typeof notice === 'string' && notice.length > 0 ? notice : null;
}
