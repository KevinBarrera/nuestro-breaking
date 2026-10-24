// Pure logic of the check-in list (#336): the event's registrations from the attendee-lists
// snapshot, the checks each one owns, the search, the filters, the counts and the row status.
import type { AttendeeLists } from '@/entities/attendee-list';
import { formatCheckInTime } from './admin-check-in-model';

// `activityId` null is the event entry, which only general-entry-only registrations own (#126).
export type RosterCheck = { activityId: string | null; name: string; checkedInAt: string | null };
export type RosterPerson = {
  registrationId: string;
  folio: string | null;
  fullName: string;
  stageName: string | null;
  confirmed: boolean;
  generalEntryOnly: boolean;
  pass: string;
  checks: RosterCheck[];
};
export type StatusFilter = 'pending' | 'done' | 'all';
// `all`, `event` (the event entry) or an activity id.
export type ActivityFilter = string;
export type RowTone = 'success' | 'warning' | 'neutral';

export const eventEntryName = 'Entrada al evento';

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });

export function buildRoster(lists: AttendeeLists): RosterPerson[] {
  const passTypes = new Map(lists.passTypes.map((pass) => [pass.id, pass]));
  const activities = new Map(lists.activities.map((activity) => [activity.id, activity]));
  return lists.registrations.map((registration) => {
    const held = registration.passTypeIds.flatMap((id) => passTypes.get(id) ?? []);
    // Mirrors the backend rule: at least one pass and every held pass is general.
    const generalEntryOnly = held.length > 0 && held.every((pass) => pass.passClass === 'general');
    const checks: RosterCheck[] = generalEntryOnly
      ? [{ activityId: null, name: eventEntryName, checkedInAt: registration.eventCheckedInAt }]
      : registration.activities
          .flatMap(({ activityId, checkedInAt }) => {
            const activity = activities.get(activityId);
            return activity ? [{ activityId, name: activity.name, checkedInAt }] : [];
          })
          .sort(byName);
    return {
      registrationId: registration.registrationId,
      folio: registration.folio,
      fullName: registration.fullName,
      stageName: registration.stageName,
      confirmed: registration.status === 'confirmed',
      generalEntryOnly,
      pass: held.map((pass) => pass.name).join(', ') || 'Sin pase',
      checks,
    };
  });
}

export function relevantChecks(person: RosterPerson, activity: ActivityFilter): RosterCheck[] {
  if (activity === 'all') return person.checks;
  const id = activity === 'event' ? null : activity;
  return person.checks.filter((check) => check.activityId === id);
}

const isDone = (person: RosterPerson, activity: ActivityFilter) => {
  const checks = relevantChecks(person, activity);
  return person.confirmed && checks.length > 0 && checks.every((check) => !!check.checkedInAt);
};

// Every registration counts for all activities, so one without actions stays findable.
const pool = (roster: RosterPerson[], activity: ActivityFilter) =>
  activity === 'all'
    ? roster
    : roster.filter((person) => relevantChecks(person, activity).length > 0);

export function statusCounts(
  roster: RosterPerson[],
  activity: ActivityFilter,
): Record<StatusFilter, number> {
  const people = pool(roster, activity);
  const done = people.filter((person) => isDone(person, activity)).length;
  return { pending: people.length - done, done, all: people.length };
}

// Pending payments are left out: their entry can't be registered yet.
export function progress(roster: RosterPerson[], activity: ActivityFilter) {
  let registered = 0;
  let total = 0;
  for (const person of pool(roster, activity)) {
    if (!person.confirmed) continue;
    for (const check of relevantChecks(person, activity)) {
      total += 1;
      if (check.checkedInAt) registered += 1;
    }
  }
  return { registered, total };
}

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const alphanumeric = (text: string) => normalize(text).replace(/[^a-z0-9]/g, '');

// Name or alias as typed, folio with or without its hyphen. Listas de respaldo searches too.
export function matchesQuery(
  person: Pick<RosterPerson, 'fullName' | 'stageName' | 'folio'>,
  query: string,
): boolean {
  const q = normalize(query.trim());
  if (!q) return true;
  if (normalize(`${person.fullName} ${person.stageName ?? ''}`).includes(q)) return true;
  const folio = alphanumeric(q);
  return !!folio && !!person.folio && alphanumeric(person.folio).includes(folio);
}

// A query searches every registration, whatever the status chip says.
export function visibleRoster(
  roster: RosterPerson[],
  filters: { query: string; status: StatusFilter; activity: ActivityFilter },
): RosterPerson[] {
  const searching = !!filters.query.trim();
  return pool(roster, filters.activity)
    .filter((person) => {
      if (searching) return matchesQuery(person, filters.query);
      if (filters.status === 'all') return true;
      return isDone(person, filters.activity) === (filters.status === 'done');
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es', { sensitivity: 'base' }));
}

export function rowStatus(
  person: RosterPerson,
  activity: ActivityFilter,
  timeZone?: string,
): { text: string; tone: RowTone } {
  if (!person.confirmed) return { text: 'Pago por revisar', tone: 'warning' };
  const checks = relevantChecks(person, activity);
  if (!checks.length) return { text: 'Consultar coordinación', tone: 'warning' };
  if (checks.length === 1) {
    const [check] = checks;
    return check.checkedInAt
      ? { text: `Entró ${formatCheckInTime(check.checkedInAt, timeZone)}`, tone: 'success' }
      : { text: 'Por entrar', tone: 'neutral' };
  }
  const done = checks.filter((check) => check.checkedInAt).length;
  if (done === checks.length) return { text: 'Completo', tone: 'success' };
  return { text: `${done} de ${checks.length} actividades`, tone: 'neutral' };
}

export function activityOptions(roster: RosterPerson[]): { id: string; label: string }[] {
  const activities = new Map<string, string>();
  let general = false;
  for (const person of roster) {
    for (const check of person.checks) {
      if (check.activityId) activities.set(check.activityId, check.name);
      else general = true;
    }
  }
  return [
    { id: 'all', label: 'Todas las actividades' },
    ...(general ? [{ id: 'event', label: `${eventEntryName} (pase general)` }] : []),
    ...[...activities]
      .map(([id, name]) => ({ id, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' })),
  ];
}

export function progressLabel(roster: RosterPerson[], activity: ActivityFilter): string {
  if (activity === 'all') return 'Entradas registradas';
  if (activity === 'event') return 'Entradas al evento';
  const name = roster
    .flatMap((person) => person.checks)
    .find((check) => check.activityId === activity)?.name;
  return name ? `Entradas a ${name}` : 'Entradas registradas';
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}
