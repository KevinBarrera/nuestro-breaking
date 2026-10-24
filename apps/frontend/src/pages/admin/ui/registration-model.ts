import {
  registrationStatuses,
  type AdminRegistrationFailure,
  type PossibleDuplicate,
  type RegistrationSearchResult,
  type RegistrationStatus,
  type RegistrationStatusCounts,
} from '@/entities/admin-registration';
import {
  participantFields,
  participantMaxLength,
  type ParticipantErrors,
  type ParticipantField,
  type ParticipantForm,
} from '@/entities/participant';
import { saleParticipantMessages, type SalePhoneMode } from './sale-participant-model';

// Inscripciones (#105, #345): copy and pure rules for the roster, the in-person registration
// form and its possible-duplicates confirmation.

const statusLabels: Record<RegistrationStatus, string> = {
  pending_payment: 'Pendiente de pago',
  confirmed: 'Confirmada',
  voided: 'Anulada',
};

export const registrationStatusLabel = (status: RegistrationStatus) => statusLabels[status];

// The backend pages 20 at a time by default; the screen asks for that explicitly.
export const registrationSearchLimit = 20;

// What the live search asks for: blank text lists the whole roster (''), one character waits
// (null) and two or more search. The field caps the text at the backend's 200 characters.
export function liveSearchQuery(text: string): string | null {
  const query = text.trim();
  if (!query) return '';
  return query.length < 2 ? null : query;
}

// The `?estado=` of the URL, when it names a status.
export const readStatusFilter = (value: string | null): RegistrationStatus | null =>
  registrationStatuses.find((status) => status === value) ?? null;

const chipOrder: { status: RegistrationStatus | null; label: string }[] = [
  { status: null, label: 'Todas' },
  { status: 'confirmed', label: 'Confirmadas' },
  { status: 'pending_payment', label: 'Pendientes de pago' },
  { status: 'voided', label: 'Anuladas' },
];

export type StatusChip = {
  status: RegistrationStatus | null;
  label: string;
  count: number;
  selected: boolean;
};

// The "Filtrar por estado" chips; the counts ignore the chosen status, as the backend answers.
export const statusChips = (
  counts: RegistrationStatusCounts,
  selected: RegistrationStatus | null,
): StatusChip[] =>
  chipOrder.map(({ status, label }) => ({
    status,
    label,
    count: counts[status ?? 'all'],
    selected: status === selected,
  }));

export const listCountText = (total: number, searching: boolean) =>
  searching
    ? `${total} ${total === 1 ? 'resultado' : 'resultados'}`
    : `${total} ${total === 1 ? 'inscripción' : 'inscripciones'}`;

export const noMatchTitle = (query: string) =>
  query ? `No encontramos a nadie con “${query}”` : 'No hay inscripciones con este filtro';

export type RegistrationRow = {
  name: string;
  aka: string;
  folio: string | null;
  passes: string;
  competitions: string;
  status: string;
  accessibleName: string;
};

// One roster row: the held passes joined and only the competitions among the activities.
export function registrationRow({
  participant,
  registration,
  passes,
  activities,
}: RegistrationSearchResult): RegistrationRow {
  const competitions = activities.filter((activity) => activity.kind === 'competition');
  const status = registrationStatusLabel(registration.status);
  // Base passes lead and add-ons follow, each group in the backend's name order.
  const ordered = [
    ...passes.filter((pass) => pass.passClass !== 'add_on'),
    ...passes.filter((pass) => pass.passClass === 'add_on'),
  ];
  return {
    name: participant.fullName,
    aka: participant.stageName ? `AKA ${participant.stageName}` : 'Sin AKA',
    folio: registration.folio,
    passes: ordered.length ? ordered.map((pass) => pass.name).join(' + ') : 'Sin pases',
    competitions: competitions.length
      ? competitions.map((activity) => activity.name).join(', ')
      : 'Sin competencias',
    status,
    accessibleName: `${participant.fullName}, ${registration.folio ?? 'sin folio'}, ${status}. Ver inscripción`,
  };
}

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
