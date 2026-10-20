import {
  registrationStatuses,
  type AdminRegistrationFailure,
  type PossibleDuplicate,
  type RegistrationStatus,
} from '@/entities/admin-registration';
import {
  participantFields,
  participantMaxLength,
  type ParticipantErrors,
  type ParticipantField,
  type ParticipantForm,
} from '@/entities/participant';
import { saleParticipantMessages, type SalePhoneMode } from './sale-participant-model';

// Inscripciones (#105): copy and pure rules for the search, the in-person registration form and
// its possible-duplicates confirmation.

const statusLabels: Record<RegistrationStatus, string> = {
  pending_payment: 'Pendiente de pago',
  confirmed: 'Confirmada',
  voided: 'Anulada',
};

export const registrationStatusLabel = (status: RegistrationStatus) => statusLabels[status];

// The backend pages 20 at a time by default; the screen asks for that explicitly.
export const registrationSearchLimit = 20;

// The search query rule of `searchRegistrations`, checked before any request.
export function searchQueryHint(q: string): string | null {
  const query = q.trim();
  if (query.length < 2) return 'Escribe al menos 2 caracteres para buscar.';
  if (query.length > 200) return 'Usa máximo 200 caracteres.';
  return null;
}

export const resultsCount = (total: number) =>
  total === 1 ? '1 inscripción' : `${total} inscripciones`;

// "Mostrando 21–40 de 45" and the offsets of the neighbour pages; null when there is none.
export function searchPageNavigation({
  total,
  limit,
  offset,
  shown,
}: {
  total: number;
  limit: number;
  offset: number;
  shown: number;
}): { range: string | null; previousOffset: number | null; nextOffset: number | null } {
  const nextOffset = offset + shown < total ? offset + limit : null;
  const previousOffset = offset > 0 ? Math.max(0, offset - limit) : null;
  const paged = nextOffset !== null || previousOffset !== null;
  return {
    range: paged && shown > 0 ? `Mostrando ${offset + 1}–${offset + shown} de ${total}` : null,
    previousOffset,
    nextOffset,
  };
}

export const activitySummary = (activities: readonly { name: string }[]) =>
  activities.length === 0
    ? 'Sin actividades'
    : activities.map((activity) => activity.name).join(', ');

// The name the next screen shows before it has read anything, as the backend builds it.
export const participantDisplayName = (form: ParticipantForm) =>
  [form.firstName, form.firstLastName, form.secondLastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');

const genericFieldMessage = 'Revisa este dato.';

function serverFieldMessage(
  field: ParticipantField,
  code: string,
  mode: SalePhoneMode,
): string | null {
  const messages = saleParticipantMessages(mode);
  const invalid: Partial<Record<ParticipantField, string>> = messages.invalid;
  if (code === 'required') return messages.required[field] ?? genericFieldMessage;
  if (code === 'invalid') return invalid[field] ?? genericFieldMessage;
  if (code === 'too_long') {
    const max = participantMaxLength[field];
    return max === undefined ? genericFieldMessage : messages.tooLong(max);
  }
  if (code === 'in_future') return messages.inFuture;
  return null;
}

const isParticipantField = (field: string): field is ParticipantField =>
  participantFields.some((known) => known === field);

// Places a 400 `fieldErrors` on the form. `unmapped` is true when any entry has no field or
// code the form can show, so the screen adds a form-level notice.
export function registrationServerErrors(
  fieldErrors: Record<string, string>,
  mode: SalePhoneMode,
): { errors: ParticipantErrors; unmapped: boolean } {
  const errors: ParticipantErrors = {};
  let unmapped = false;
  for (const [field, code] of Object.entries(fieldErrors)) {
    const message = isParticipantField(field) ? serverFieldMessage(field, code, mode) : null;
    if (message && isParticipantField(field)) errors[field] = message;
    else unmapped = true;
  }
  return { errors, unmapped };
}

export type DuplicateMatchRow = {
  registrationId: string;
  fullName: string;
  stageName: string | null;
  folio: string;
  status: string;
  email: string;
  phone: string;
  // Only a pending registration can go on to pass selection and payment.
  canContinue: boolean;
};

export const duplicateMatchRows = (matches: readonly PossibleDuplicate[]): DuplicateMatchRow[] =>
  matches.map((match) => ({
    registrationId: match.registrationId,
    fullName: match.fullName,
    stageName: match.stageName,
    folio: match.folio ?? 'Sin folio',
    status: registrationStatusLabel(match.status),
    email: match.maskedEmail ?? 'Sin correo',
    phone: match.maskedPhone ?? 'Sin teléfono',
    canContinue: match.status === 'pending_payment',
  }));

export const registrationDeniedMessage =
  'Sin acceso: tu cuenta no puede registrar inscripciones en este evento.';
export const unknownOutcomeMessage =
  'No pudimos confirmar si la inscripción se guardó. Busca al participante antes de intentarlo de nuevo.';

// The form-level message of a failed create. Field errors and possible duplicates get their own
// presentation; their message here is only the summary line.
export function createFailureMessage(failure: AdminRegistrationFailure): string {
  switch (failure.kind) {
    case 'unauthorized':
    case 'forbidden':
      return registrationDeniedMessage;
    case 'unknown':
      return unknownOutcomeMessage;
    case 'invalid':
      return 'Revisa los datos del participante e intenta de nuevo.';
    default:
      return 'No pudimos registrar la inscripción. Intenta de nuevo.';
  }
}

// What the search or the form already knows about a registration, passed in the navigation
// state so its screen can name it before reading. A reload loses it.
export type RegistrationContext = { participantName: string; status: RegistrationStatus };

export function readRegistrationContext(state: unknown): RegistrationContext | null {
  if (typeof state !== 'object' || state === null) return null;
  const { participantName, status } = state as Record<string, unknown>;
  if (typeof participantName !== 'string' || !participantName.trim()) return null;
  if (!registrationStatuses.some((known) => known === status)) return null;
  return { participantName, status: status as RegistrationStatus };
}
