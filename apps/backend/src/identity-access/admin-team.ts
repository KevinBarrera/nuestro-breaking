import { normalizeAdminDisplayName, normalizeAdminEmail } from './admin-invitation';

// Pure input parsing and response mapping for team management (#214 T3, T4).

export type TeamAccessInput = { kind: 'global' } | { kind: 'events'; eventIds: string[] };
export type InviteInput = { displayName: string; email: string; access: TeamAccessInput };
export type ParseResult<T> =
  { ok: true; value: T } | { ok: false; fieldErrors: Record<string, 'invalid'> };

export type TeamAccess =
  { kind: 'global' } | { kind: 'events'; events: { id: string; name: string }[] };
export type TeamMemberStatus = 'active' | 'pending' | 'deactivated';
export type TeamMember = {
  id: string;
  displayName: string;
  email: string;
  status: TeamMemberStatus;
  access: TeamAccess;
  /** The open (neither used nor cancelled) invitation, if any. */
  invitation: { expiresAt: string; expired: boolean } | null;
};

/** One active `admin` role of a user, with the event it scopes when it is event-scoped. */
export type TeamRoleRow = {
  userId: string;
  displayName: string | null;
  email: string;
  active: boolean;
  hasPassword: boolean;
  scopeType: string;
  eventId: string | null;
  eventName: string | null;
};
export type TeamInvitationRow = { userId: string; expiresAt: Date };

const MAX_EVENTS = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[a-f0-9]{64}$/;

function parseAccess(raw: unknown): TeamAccessInput | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const access = raw as Record<string, unknown>;
  if (access.kind === 'global') return { kind: 'global' };
  if (access.kind !== 'events') return null;
  const ids = access.eventIds;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > MAX_EVENTS ||
    ids.some((id) => typeof id !== 'string' || !UUID.test(id))
  )
    return null;
  const eventIds = (ids as string[]).map((id) => id.toLowerCase());
  return new Set(eventIds).size === eventIds.length ? { kind: 'events', eventIds } : null;
}

/** Validates an invitation request. Errors name fields only and never echo the submitted values. */
export function parseInviteInput(body: unknown): ParseResult<InviteInput> {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return { ok: false, fieldErrors: { body: 'invalid' } };
  const input = body as Record<string, unknown>;
  const displayName = normalizeAdminDisplayName(input.displayName);
  const email = normalizeAdminEmail(input.email);
  const access = parseAccess(input.access);
  const fieldErrors: Record<string, 'invalid'> = {};
  if (!displayName) fieldErrors.displayName = 'invalid';
  if (!email) fieldErrors.email = 'invalid';
  if (!access) fieldErrors.access = 'invalid';
  if (!displayName || !email || !access) return { ok: false, fieldErrors };
  return { ok: true, value: { displayName, email, access } };
}

/** An activation token as issued (64 lowercase hex characters), or `null`. */
export function parseActivationToken(value: unknown): string | null {
  return typeof value === 'string' && TOKEN.test(value) ? value : null;
}

/**
 * Groups role rows into one member per user. Global access wins over event roles; event lists are
 * sorted by name. Members are sorted by status (active, pending, deactivated), then by name.
 */
export function buildTeamMembers(
  roles: TeamRoleRow[],
  invitations: TeamInvitationRow[],
  now: Date,
): TeamMember[] {
  const open = new Map(invitations.map((row) => [row.userId, row.expiresAt]));
  const byUser = new Map<string, TeamRoleRow[]>();
  for (const row of roles) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);

  const members = [...byUser.entries()].map(([id, rows]): TeamMember => {
    const [first] = rows;
    const events = new Map<string, string>();
    for (const row of rows)
      if (row.scopeType === 'event' && row.eventId) events.set(row.eventId, row.eventName ?? '');
    const access: TeamAccess = rows.some((row) => row.scopeType === 'global')
      ? { kind: 'global' }
      : {
          kind: 'events',
          events: [...events.entries()]
            .map(([eventId, name]) => ({ id: eventId, name }))
            .sort((left, right) => left.name.localeCompare(right.name, 'es')),
        };
    const status: TeamMemberStatus = !first.active
      ? 'deactivated'
      : first.hasPassword
        ? 'active'
        : 'pending';
    const expiresAt = first.active ? open.get(id) : undefined;
    return {
      id,
      displayName: first.displayName ?? '',
      email: first.email,
      status,
      access,
      invitation: expiresAt
        ? { expiresAt: expiresAt.toISOString(), expired: expiresAt.getTime() <= now.getTime() }
        : null,
    };
  });

  const order: Record<TeamMemberStatus, number> = { active: 0, pending: 1, deactivated: 2 };
  return members.sort(
    (left, right) =>
      order[left.status] - order[right.status] ||
      left.displayName.localeCompare(right.displayName, 'es') ||
      left.email.localeCompare(right.email),
  );
}
