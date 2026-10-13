import type {
  AdminEventErrorCode,
  AdminEventFailure,
  AdminEventSummary,
} from '@/entities/admin-event';

// Pure logic and Spanish copy for the event list (#213).

export function splitEvents(events: AdminEventSummary[]) {
  return {
    active: events.filter((event) => event.archivedAt === null),
    archived: events.filter((event) => event.archivedAt !== null),
  };
}

// With exactly one active event there is nothing to choose, so the landing opens it. Global
// admins always see the list: it holds "Crear evento" and the archived events, and a redirect
// would hide both.
export function landingRedirect(
  active: AdminEventSummary[],
  canManageEvents: boolean,
): string | null {
  return !canManageEvents && active.length === 1 ? active[0].id : null;
}

export const folioPattern = (prefix: string) => `${prefix}-····`;

export const restoredNotice = (name: string) =>
  `«${name}» volvió a la lista de eventos. La venta en línea sigue cerrada: ábrela desde el resumen del evento cuando esté lista.`;

const ruleMessages: Record<AdminEventErrorCode, string> = {
  slug_taken: 'Esta dirección ya la usa otro evento. Elige otra.',
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
