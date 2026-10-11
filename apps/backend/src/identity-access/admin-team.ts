import { normalizeAdminDisplayName, normalizeAdminEmail } from './admin-invitation';
import { hasControlCharacters } from './password-policy';

// Pure input parsing and response mapping for team management (#214 T3, T4).

export type TeamAccessInput = { kind: 'global' } | { kind: 'events'; eventIds: string[] };
export type InviteInput = { displayName: string; email: string; access: TeamAccessInput };
export type AccessChangeInput = { access: TeamAccessInput; reason: string | null };
export type ReasonInput = { reason: string | null };
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
  /**
   * The open (neither used nor cancelled) invitation, if any. Always `null` for a deactivated
   * member: activation refuses their links, so an open one is hidden rather than shown as usable.
   */
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

const MAX_REASON = 500;

/**
 * A trimmed reason of 1 to 500 characters without control characters. `undefined` means the
 * value is invalid; `null` means it is missing or blank, which only optional reasons accept.
 */
function parseReason(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string' || hasControlCharacters(raw)) return undefined;
  const reason = raw.trim();
  if (!reason) return null;
  return reason.length <= MAX_REASON ? reason : undefined;
}

/** Validates an access change: the complete new access and an optional reason. */
export function parseAccessChangeInput(body: unknown): ParseResult<AccessChangeInput> {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return { ok: false, fieldErrors: { body: 'invalid' } };
  const input = body as Record<string, unknown>;
  const access = parseAccess(input.access);
  const reason = parseReason(input.reason);
  const fieldErrors: Record<string, 'invalid'> = {};
  if (!access) fieldErrors.access = 'invalid';
  if (reason === undefined) fieldErrors.reason = 'invalid';
  if (!access || reason === undefined) return { ok: false, fieldErrors };
  return { ok: true, value: { access, reason } };
}

/** Validates a body that only carries a reason, required for deactivation and optional otherwise. */
export function parseReasonInput(body: unknown, required: boolean): ParseResult<ReasonInput> {
  const raw =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).reason
      : undefined;
  const reason = parseReason(raw);
  if (reason === undefined || (required && reason === null))
    return { ok: false, fieldErrors: { reason: 'invalid' } };
  return { ok: true, value: { reason } };
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
