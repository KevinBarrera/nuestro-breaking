// Pure logic of the check-in screen (#126): reading the registration search, which entrance
// actions a registration gets, the answer of a check-in and the notice that follows it.

export type CheckInActivity = {
  id: string;
  name: string;
  kind: string;
  checkedInAt: string | null;
};
export type CheckInRow = {
  participant: { id: string; fullName: string; email: string | null; stageName: string | null };
  registration: {
    id: string;
    eventId: string;
    folio: string | null;
    status: string;
    checkedInAt: string | null;
    generalEntryOnly: boolean;
  };
  activities: CheckInActivity[];
};
export type CheckInPage = { results: CheckInRow[]; total: number };
export type CheckInTarget = { kind: 'event' } | { kind: 'activity'; activity: CheckInActivity };
// `escalate` sends the person to main coordination; `event` is the event action, shown only for
// general-entry-only registrations; `activities` get one action each.
export type CheckInPlan = {
  escalate: boolean;
  event: { checkedInAt: string | null } | null;
  activities: CheckInActivity[];
};
export type Admission = { checkedInAt: string; alreadyCheckedIn: boolean };
export type AdmissionOutcome =
  { kind: 'recorded' | 'repeat'; checkedInAt: string } | { kind: 'rejected' | 'denied' | 'error' };
export type CheckInNotice = { kind: 'success' | 'already' | 'escalate' | 'error'; text: string };

export const escalationMessage =
  'Envía a la persona a coordinación general. En la entrada no se hacen cambios de inscripción ni de competencias.';

const eligibleKinds = new Set(['workshop', 'competition']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isInstant = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));
const isInstantOrNull = (value: unknown): value is string | null =>
  value === null || isInstant(value);
const isTextOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

function isActivity(value: unknown): value is CheckInActivity {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.kind === 'string' &&
    isInstantOrNull(value.checkedInAt)
  );
}

// `generalEntryOnly` must be a boolean. A missing flag means a backend that predates #126, whose
// activities are not the pass entitlements, so the row is rejected like any other malformed field
// and the screen asks staff to verify instead of guessing which action applies.
function isRow(value: unknown, eventId: string): value is CheckInRow {
  if (!isRecord(value) || !isRecord(value.participant) || !isRecord(value.registration))
    return false;
  const { participant, registration } = value;
  return (
    typeof participant.fullName === 'string' &&
    isTextOrNull(participant.email ?? null) &&
    isTextOrNull(participant.stageName ?? null) &&
    typeof registration.id === 'string' &&
    registration.eventId === eventId &&
    typeof registration.status === 'string' &&
    isInstantOrNull(registration.checkedInAt) &&
    typeof registration.generalEntryOnly === 'boolean' &&
    Array.isArray(value.activities) &&
    value.activities.every(isActivity)
  );
}

// Reads every row or none, so the screen never acts on a partial or foreign projection.
export function readCheckInPage(value: unknown, eventId: string): CheckInPage | null {
  if (!isRecord(value) || !Array.isArray(value.results)) return null;
  const { total, results } = value;
  if (typeof total !== 'number' || !Number.isSafeInteger(total)) return null;
  if (!results.every((row) => isRow(row, eventId))) return null;
  return { results, total };
}

const byName = (a: CheckInActivity, b: CheckInActivity) =>
  a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) || (a.id < b.id ? -1 : 1);

export function checkInPlan(row: CheckInRow): CheckInPlan {
  if (row.registration.status !== 'confirmed')
    return { escalate: true, event: null, activities: [] };
  const activities = row.activities
    .filter((activity) => eligibleKinds.has(activity.kind))
    .sort(byName);
  const event = row.registration.generalEntryOnly
    ? { checkedInAt: row.registration.checkedInAt }
    : null;
  return { escalate: !event && activities.length === 0, event, activities };
}

export function canAdmit(row: CheckInRow, target: CheckInTarget): boolean {
  const plan = checkInPlan(row);
  if (target.kind === 'event') return !!plan.event && !plan.event.checkedInAt;
  const listed = plan.activities.find((activity) => activity.id === target.activity.id);
  return !!listed && !listed.checkedInAt;
}

// The check-in time of the target in a refreshed row, or null while it is still pending.
export function recordedAt(row: CheckInRow, target: CheckInTarget): string | null {
  if (target.kind === 'event') return row.registration.checkedInAt;
  return row.activities.find((activity) => activity.id === target.activity.id)?.checkedInAt ?? null;
}

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

export const actionLabel = (target: CheckInTarget) =>
  target.kind === 'event'
    ? 'Registrar entrada al evento'
    : `Registrar entrada a ${target.activity.name}`;

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
      text:
        target.kind === 'event'
          ? 'Entrada al evento registrada'
          : `Entrada a ${target.activity.name} registrada`,
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
