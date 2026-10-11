import {
  type IssuedLink,
  teamErrorCodes,
  teamMemberStatuses,
  type TeamAccess,
  type TeamErrorCode,
  type TeamFailure,
  type TeamMember,
} from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isInstant = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));

function readAccess(value: unknown): TeamAccess | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'global') return { kind: 'global' };
  if (value.kind !== 'events' || !Array.isArray(value.events)) return null;
  const events = value.events.map((event: unknown) =>
    isRecord(event) && typeof event.id === 'string' && typeof event.name === 'string'
      ? { id: event.id, name: event.name }
      : null,
  );
  return events.every((event) => event !== null) ? { kind: 'events', events } : null;
}

function readMember(value: unknown): TeamMember | null {
  if (!isRecord(value)) return null;
  const { id, displayName, email, status, invitation } = value;
  const access = readAccess(value.access);
  const knownStatus = teamMemberStatuses.find((known) => known === status);
  if (
    typeof id !== 'string' ||
    typeof displayName !== 'string' ||
    typeof email !== 'string' ||
    !knownStatus ||
    !access
  )
    return null;
  if (invitation === null)
    return { id, displayName, email, status: knownStatus, access, invitation };
  if (!isRecord(invitation) || !isInstant(invitation.expiresAt)) return null;
  if (typeof invitation.expired !== 'boolean') return null;
  return {
    id,
    displayName,
    email,
    status: knownStatus,
    access,
    invitation: { expiresAt: invitation.expiresAt, expired: invitation.expired },
  };
}

// The whole list is rejected when any member is malformed, so the screen never shows a
// partial team.
export function readTeam(value: unknown): TeamMember[] | null {
  if (!isRecord(value) || !Array.isArray(value.members)) return null;
  const members = value.members.map(readMember);
  return members.every((member) => member !== null) ? members : null;
}

// Maps a failed response to what the screens need: only known codes and field error values
// pass through; anything else is a generic error.
export function readTeamFailure(status: number, body: unknown): TeamFailure {
  if (status === 401 || status === 403) return { kind: 'denied' };
  if (status === 400) {
    const raw = isRecord(body) && isRecord(body.fieldErrors) ? body.fieldErrors : {};
    const fieldErrors = Object.fromEntries(
      Object.entries(raw).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
    return { kind: 'invalid', fieldErrors };
  }
  if (status === 404 || status === 409) {
    const code = isRecord(body) ? body.code : undefined;
    const known = teamErrorCodes.find(
      (candidate): candidate is TeamErrorCode => candidate === code,
    );
    if (known) return { kind: 'rule', code: known };
  }
  return { kind: 'error' };
}

// The activation link must be an absolute http(s) URL carrying the token in its fragment.
export function readIssuedLink(value: unknown): IssuedLink | null {
  if (!isRecord(value)) return null;
  const { userId, activationUrl, expiresAt } = value;
  if (typeof userId !== 'string' || typeof activationUrl !== 'string' || !isInstant(expiresAt))
    return null;
  let url: URL;
  try {
    url = new URL(activationUrl);
  } catch {
    return null;
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.hash.length < 2) return null;
  return { userId, activationUrl, expiresAt };
}
