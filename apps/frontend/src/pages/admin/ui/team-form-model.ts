import type {
  TeamAccess,
  TeamAccessInput,
  TeamErrorCode,
  TeamFailure,
} from '@/entities/admin-team';

// Pure form logic and Spanish messages for the team screens (#214).

const ruleMessages: Record<TeamErrorCode, string> = {
  email_in_use: 'Ese correo ya tiene una cuenta. Usa otro correo.',
  self_change: 'No puedes cambiar tu propio acceso.',
  self_deactivation: 'No puedes desactivar tu propio acceso.',
  last_global_admin: 'Debe quedar al menos una persona activa con acceso a todos los eventos.',
  member_deactivated: 'Esta persona está desactivada. Reactívala primero.',
  member_active: 'Esta persona ya está activa. Recarga la lista.',
  member_not_found: 'No encontramos a esta persona en el equipo. Recarga la lista.',
  no_open_invitation: 'Esta persona ya no tiene una invitación abierta. Recarga la lista.',
};

export function teamFailureMessage(failure: TeamFailure): string {
  if (failure.kind === 'rule') return ruleMessages[failure.code];
  if (failure.kind === 'denied')
    return 'Tu sesión terminó o ya no tienes acceso a todos los eventos. Vuelve a iniciar sesión.';
  if (failure.kind === 'invalid') return 'Revisa los datos e inténtalo de nuevo.';
  return 'No se pudo completar la operación. Inténtalo de nuevo.';
}

// After a lost or unreadable answer the invitation may exist, and a retry with the same email
// then gets `email_in_use`; both cases point to Equipo instead of asking for another email.
export function inviteMayExist(failure: TeamFailure, earlierUnknown: boolean): boolean {
  if (failure.kind === 'unknown') return true;
  return earlierUnknown && failure.kind === 'rule' && failure.code === 'email_in_use';
}

export const inviteMayExistMessage =
  'Es posible que la invitación sí se haya creado. Revisa Equipo: si la persona aparece, usa «Nuevo enlace» para darle un enlace.';

export type AccessDraft = { scope: 'global' | 'events'; eventIds: string[] };

export function accessInput(draft: AccessDraft): TeamAccessInput {
  return draft.scope === 'global'
    ? { kind: 'global' }
    : { kind: 'events', eventIds: draft.eventIds };
}

export function accessDraftFrom(access: TeamAccess): AccessDraft {
  return access.kind === 'global'
    ? { scope: 'global', eventIds: [] }
    : { scope: 'events', eventIds: access.events.map((event) => event.id) };
}

export type InviteDraft = { displayName: string; email: string; access: AccessDraft };
export type InviteErrors = Partial<Record<'displayName' | 'email' | 'access', string>>;

const emailMessage = 'Escribe un correo válido, por ejemplo nombre@dominio.com.';
const noEventMessage = 'Elige al menos un evento.';
const reasonMessage = 'Escribe un motivo de hasta 500 caracteres.';

// Mirrors the backend limits so most mistakes show before a request.
export function validateInvite(draft: InviteDraft): InviteErrors {
  const errors: InviteErrors = {};
  const name = draft.displayName.trim();
  if (!name) errors.displayName = 'Escribe el nombre.';
  else if (name.length > 200) errors.displayName = 'Usa 200 caracteres o menos.';
  const email = draft.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) errors.email = emailMessage;
  if (draft.access.scope === 'events' && draft.access.eventIds.length === 0)
    errors.access = noEventMessage;
  return errors;
}

export type ServerFieldErrors = InviteErrors & { reason?: string };

// The backend's 400 `fieldErrors` hold codes (`invalid`, `unknown_event`), never the values.
export function serverFieldErrors(fieldErrors: Record<string, string>): ServerFieldErrors {
  const errors: ServerFieldErrors = {};
  if (fieldErrors.displayName) errors.displayName = 'Revisa el nombre.';
  if (fieldErrors.email) errors.email = emailMessage;
  if (fieldErrors.access)
    errors.access =
      fieldErrors.access === 'unknown_event'
        ? 'Uno de los eventos elegidos ya no existe. Recarga la página.'
        : noEventMessage;
  if (fieldErrors.reason) errors.reason = reasonMessage;
  return errors;
}

export function reasonError(reason: string): string | null {
  const trimmed = reason.trim();
  if (!trimmed) return 'Escribe el motivo.';
  if (
    trimmed.length > 500 ||
    [...trimmed].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    return reasonMessage;
  return null;
}
