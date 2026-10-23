import type {
  TeamAccess,
  TeamAccessInput,
  TeamErrorCode,
  TeamFailure,
} from '@/entities/admin-team';
import { hasControlCharacters } from '@/shared/lib';

// Pure form logic and Spanish messages for the team screens (#214).

const ruleMessages: Record<TeamErrorCode, string> = {
  email_in_use: 'Ese correo ya tiene una cuenta. Usa otro correo.',
  self_change: 'No puedes cambiar tu propio acceso.',
  self_deactivation: 'No puedes desactivar tu propio acceso.',
  last_global_admin: 'Debe quedar al menos una persona activa con acceso a todos los eventos.',
  member_deactivated: 'Esta persona está desactivada. Reactívala primero.',
  member_no_access: 'Esta persona no tiene acceso. Cambia su acceso primero.',
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

// A member without access starts with no event chosen, so the dialog asks for one.
export function accessDraftFrom(access: TeamAccess): AccessDraft {
  if (access.kind === 'global') return { scope: 'global', eventIds: [] };
  if (access.kind === 'none') return { scope: 'events', eventIds: [] };
  return { scope: 'events', eventIds: access.events.map((event) => event.id) };
}

// Cambiar acceso keeps "Guardar acceso" off until the draft differs. Someone without access has
// nothing to keep, so any choice counts as a change and an empty one shows the error.
export function accessUnchanged(draft: AccessDraft, access: TeamAccess): boolean {
  if (access.kind === 'none') return false;
  if (access.kind === 'global') return draft.scope === 'global';
  if (draft.scope === 'global') return false;
  const current = new Set(access.events.map((event) => event.id));
  return draft.eventIds.length === current.size && draft.eventIds.every((id) => current.has(id));
}

export function currentAccessText(access: TeamAccess): string {
  if (access.kind === 'global') return 'Ahora: todos los eventos.';
  if (access.kind === 'none') return 'Ahora: sin acceso.';
  return `Ahora: ${access.events.map((event) => event.name).join(', ')}.`;
}

export type InviteDraft = { displayName: string; email: string; access: AccessDraft };
export type InviteErrors = Partial<Record<'displayName' | 'email' | 'access', string>>;

const emailMessage = 'Escribe un correo válido, por ejemplo nombre@dominio.com.';
const noEventMessage = 'Elige al menos un evento.';
const reasonMessage = 'Escribe un motivo de hasta 500 caracteres.';

// Shared by the invite form and the Cambiar acceso dialog.
export function accessError(access: AccessDraft): string | null {
  return access.scope === 'events' && access.eventIds.length === 0 ? noEventMessage : null;
}

// Mirrors the backend limits so most mistakes show before a request.
export function validateInvite(draft: InviteDraft): InviteErrors {
  const errors: InviteErrors = {};
  const name = draft.displayName.trim();
  if (!name) errors.displayName = 'Escribe el nombre.';
  else if (name.length > 200) errors.displayName = 'Usa 200 caracteres o menos.';
  const email = draft.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) errors.email = emailMessage;
  const access = accessError(draft.access);
  if (access) errors.access = access;
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
  if (!trimmed) return 'Escribe el motivo para dejarlo en el historial.';
  if (trimmed.length > 500 || hasControlCharacters(trimmed)) return reasonMessage;
  return null;
}
