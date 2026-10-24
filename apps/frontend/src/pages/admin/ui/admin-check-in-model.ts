// Pure logic of the check-in screen (#126, #336): the answer of a check-in and the notice that
// follows it. The list itself lives in `check-in-roster-model.ts`.

// What a check-in targets: the event entry (`activityId` null) or one activity.
export type CheckInTarget = { activityId: string | null; name: string };
export type Admission = { checkedInAt: string; alreadyCheckedIn: boolean };
export type AdmissionOutcome =
  { kind: 'recorded' | 'repeat'; checkedInAt: string } | { kind: 'rejected' | 'denied' | 'error' };
export type CheckInNotice = { kind: 'success' | 'already' | 'escalate' | 'error'; text: string };

export const escalationMessage =
  'Envía a la persona a coordinación general. En la entrada no se hacen cambios de inscripción ni de competencias.';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isInstant = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));

// Reads a 201 check-in answer, which must describe the requested target.
export function readAdmission(
  value: unknown,
  expected: { eventId: string; registrationId: string; activityId?: string },
): Admission | null {
  if (!isRecord(value)) return null;
  const { eventId, registrationId, activityId, checkedInAt, alreadyCheckedIn } = value;
  if (eventId !== expected.eventId || registrationId !== expected.registrationId) return null;
  if (expected.activityId !== undefined && activityId !== expected.activityId) return null;
  if (!isInstant(checkedInAt) || typeof alreadyCheckedIn !== 'boolean') return null;
  return { checkedInAt, alreadyCheckedIn };
}

// Staff are at the venue, so the browser zone is the default.
export function formatCheckInTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(iso));
}

// `refreshed` is the target's check-in time in the projection read after the request: success
// and repeats are announced only when the projection confirms them.
export function admissionNotice(
  outcome: AdmissionOutcome,
  target: CheckInTarget,
  refreshed: string | null,
  timeZone?: string,
): CheckInNotice {
  if (outcome.kind === 'recorded' && refreshed)
    return {
      kind: 'success',
      text: `${target.activityId ? `Entrada a ${target.name}` : 'Entrada al evento'} registrada a las ${formatCheckInTime(refreshed, timeZone)}.`,
    };
  if (outcome.kind === 'repeat' && refreshed)
    return {
      kind: 'already',
      text: `Esta entrada ya estaba registrada a las ${formatCheckInTime(outcome.checkedInAt, timeZone)}.`,
    };
  if (outcome.kind === 'rejected') return { kind: 'escalate', text: escalationMessage };
  if (outcome.kind === 'denied')
    return {
      kind: 'error',
      text: 'Acceso denegado para registrar esta entrada. Consulta al responsable.',
    };
  return {
    kind: 'error',
    text: 'No se pudo registrar la entrada. Consulta al responsable antes de continuar.',
  };
}
