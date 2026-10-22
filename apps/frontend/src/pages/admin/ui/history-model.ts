import { formatMxn } from '@/entities/event-catalog';
import type {
  HistoryActor,
  HistoryCashValues,
  HistoryDetails,
  HistoryFilter,
} from '@/entities/registration-history';

// Historial (#104): Spanish copy for each operation of an event's registration history.
const titles: Record<HistoryDetails['kind'], string> = {
  manual_registration: 'Inscripción presencial',
  online_registration: 'Compra en línea',
  complimentary_confirmation: 'Cortesía',
  pass_assignment: 'Pase agregado',
  pass_removal: 'Pase quitado',
  pass_selection_change: 'Cambio de competencias',
  cash_confirmation: 'Pago en efectivo',
  cash_correction: 'Corrección de pago en efectivo',
  payment_approval: 'Pago en línea aprobado',
  registration_void: 'Inscripción anulada',
  registration_expiry: 'Inscripción vencida',
  registration_correction: 'Corrección de nombre o AKA',
  registration_discipline_swap: 'Cambio de disciplina',
  other: 'Otra operación',
};

export const historyTitle = (kind: HistoryDetails['kind']) => titles[kind];

export function historyActorLabel(actor: HistoryActor): string {
  if (actor.kind === 'public') return 'Compra en línea';
  if (actor.kind === 'system') return 'Sistema';
  return actor.name ?? 'Administrador';
}

const statusLabels: Record<string, string> = {
  pending_payment: 'Pendiente de pago',
  confirmed: 'Confirmada',
  voided: 'Anulada',
  expired: 'Vencida',
};

const fieldLabels: Record<string, string> = {
  firstName: 'nombre',
  firstLastName: 'primer apellido',
  secondLastName: 'segundo apellido',
  stageName: 'AKA',
};

const unknownPass = 'pase desconocido';
const passName = (name: string | null) => name ?? unknownPass;
const statusLabel = (status: string) => statusLabels[status] ?? 'Otro estado';
const list = (names: string[]) => (names.length > 0 ? names.join(', ') : 'ninguna');

function cashLine({ amountCents, receipt }: HistoryCashValues): string {
  const amount = amountCents === null ? 'Sin monto' : formatMxn(amountCents);
  return `${amount}, ${receipt === null ? 'sin recibo' : `recibo ${receipt}`}`;
}

function competitionChange(from: string[], to: string[]): string[] {
  const added = to.filter((name) => !from.includes(name));
  const removed = from.filter((name) => !to.includes(name));
  return [
    ...(added.length > 0 ? [`Agregadas: ${added.join(', ')}`] : []),
    ...(removed.length > 0 ? [`Quitadas: ${removed.join(', ')}`] : []),
  ];
}

// One line with what the operation changed, or null when the title says it all.
export function historyDetailLine(details: HistoryDetails): string | null {
  switch (details.kind) {
    case 'manual_registration':
    case 'online_registration':
    case 'complimentary_confirmation':
    case 'other':
      return null;
    case 'pass_assignment':
    case 'pass_removal':
      return `Pase: ${passName(details.passTypeName)}`;
    case 'pass_selection_change': {
      const changes = competitionChange(details.fromActivityNames, details.toActivityNames);
      if (changes.length === 0) return 'Sin cambios en las competencias';
      return [...(details.passTypeName ? [details.passTypeName] : []), ...changes].join(' · ');
    }
    case 'cash_confirmation':
      return cashLine(details);
    case 'cash_correction':
      return `${cashLine(details.previous)} → ${cashLine(details.current)}`;
    case 'payment_approval': {
      if (details.amountCents === null) return null;
      const amount = formatMxn(details.amountCents);
      return details.lateApproval ? `${amount} · Aprobado después del vencimiento` : amount;
    }
    case 'registration_void':
    case 'registration_expiry':
      return details.fromStatus && details.toStatus
        ? `${statusLabel(details.fromStatus)} → ${statusLabel(details.toStatus)}`
        : null;
    case 'registration_correction': {
      const fields = [
        ...new Set(details.changedFields.map((field) => fieldLabels[field] ?? 'otro dato')),
      ];
      return fields.length > 0 ? `Cambió: ${fields.join(', ')}` : null;
    }
    case 'registration_discipline_swap': {
      const passes = `${passName(details.fromPassTypeName)} → ${passName(details.toPassTypeName)}`;
      const { fromActivityNames: from, toActivityNames: to } = details;
      if (from.length === 0 && to.length === 0) return passes;
      return `${passes} · Competencias: ${list(from)} → ${list(to)}`;
    }
  }
}

export const folioLabel = (folio: string | null) => (folio ? `Folio ${folio}` : 'Sin folio');

export const reasonLine = (reason: string | null) =>
  reason?.trim() ? `Motivo: ${reason.trim()}` : null;

// Without the event's time zone the times fall back to the device clock, and say so.
export const historyClockNote = (timeZone: string | null) =>
  timeZone
    ? `Horas en la zona horaria del evento: ${timeZone}.`
    : 'Horas en la zona horaria de este dispositivo.';

export const emptyHistoryMessage = (filter: HistoryFilter) =>
  filter === 'corrections'
    ? 'Todavía no hay correcciones registradas.'
    : 'Todavía no hay operaciones registradas.';
