import {
  attendeeListActivityKinds,
  attendeeListPassClasses,
  attendeeListStatuses,
  type AttendeeListActivity,
  type AttendeeListPassType,
  type AttendeeListRegistration,
  type AttendeeLists,
} from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isInstant = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));

const isInstantOrNull = (value: unknown): value is string | null =>
  value === null || isInstant(value);

const isStringOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  values.some((known) => known === value);

function readPassType(value: unknown): AttendeeListPassType | null {
  if (!isRecord(value)) return null;
  const { id, name, passClass, status } = value;
  if (typeof id !== 'string' || typeof name !== 'string') return null;
  if (!isOneOf(attendeeListPassClasses, passClass) || typeof status !== 'string') return null;
  return { id, name, passClass, archived: status === 'archived' };
}

function readActivity(value: unknown): AttendeeListActivity | null {
  if (!isRecord(value)) return null;
  const { id, name, kind, startsAt } = value;
  if (typeof id !== 'string' || typeof name !== 'string' || !isInstant(startsAt)) return null;
  if (!isOneOf(attendeeListActivityKinds, kind)) return null;
  return { id, name, kind, startsAt };
}

function readActivityCheckIn(
  value: unknown,
): AttendeeListRegistration['activities'][number] | null {
  if (!isRecord(value)) return null;
  const { activityId, checkedInAt } = value;
  if (typeof activityId !== 'string' || !isInstantOrNull(checkedInAt)) return null;
  return { activityId, checkedInAt };
}

// Builds the row field by field, so anything else the body carries (such as a contact field)
// never reaches the screen.
function readRegistration(value: unknown): AttendeeListRegistration | null {
  if (!isRecord(value)) return null;
  const { registrationId, folio, fullName, stageName, status, eventCheckedInAt } = value;
  if (typeof registrationId !== 'string' || typeof fullName !== 'string') return null;
  if (!isStringOrNull(folio) || !isStringOrNull(stageName)) return null;
  if (!isOneOf(attendeeListStatuses, status) || !isInstantOrNull(eventCheckedInAt)) return null;
  if (!Array.isArray(value.passTypeIds) || !Array.isArray(value.activities)) return null;
  const passTypeIds = value.passTypeIds.filter((id): id is string => typeof id === 'string');
  const activities = readAll(value.activities, readActivityCheckIn);
  if (passTypeIds.length !== value.passTypeIds.length || !activities) return null;
  return {
    registrationId,
    folio,
    fullName,
    stageName,
    status,
    eventCheckedInAt,
    passTypeIds,
    activities,
  };
}

// A list with any malformed entry is rejected as a whole.
function readAll<T>(values: unknown, read: (value: unknown) => T | null): T[] | null {
  if (!Array.isArray(values)) return null;
  const entries = values.map(read);
  return entries.every((entry): entry is T => entry !== null) ? entries : null;
}

export function readAttendeeLists(value: unknown): AttendeeLists | null {
  if (!isRecord(value) || !isRecord(value.event) || !isInstant(value.generatedAt)) return null;
  const { id, name } = value.event;
  if (typeof id !== 'string' || typeof name !== 'string') return null;
  const passTypes = readAll(value.passTypes, readPassType);
  const activities = readAll(value.activities, readActivity);
  const registrations = readAll(value.registrations, readRegistration);
  if (!passTypes || !activities || !registrations) return null;
  return {
    event: { id, name },
    generatedAt: value.generatedAt,
    passTypes,
    activities,
    registrations,
  };
}
