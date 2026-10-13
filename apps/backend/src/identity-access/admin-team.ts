import { normalizeAdminDisplayName, normalizeAdminEmail } from './admin-invitation';
import { hasControlCharacters } from './password-policy';

// Pure input parsing and response mapping for team management (#214 T3, T4).

export type TeamAccessInput = { kind: 'global' } | { kind: 'events'; eventIds: string[] };
export type InviteInput = { displayName: string; email: string; access: TeamAccessInput };
export type AccessChangeInput = { access: TeamAccessInput; reason: string | null };
export type ParseResult<T> =
  { ok: true; value: T } | { ok: false; fieldErrors: Record<string, 'invalid'> };

/**
 * `none` is a member with no active admin role left, for example because the only event they
 * administered was deleted (#213 D9). A global admin gives them access again with an access change.
 */
export type TeamAccess =
  | { kind: 'global' }
  | { kind: 'events'; events: { id: string; name: string }[] }
  | { kind: 'none' };
/** `no_access` is an active (not deactivated) member whose access is `none`. */
export type TeamMemberStatus = 'active' | 'pending' | 'no_access' | 'deactivated';
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

/**
 * One active `admin` role of a team member, with the event it scopes when it is event-scoped. A
 * member without any active admin role comes as one row whose `scopeType` is `null`.
 */
export type TeamRoleRow = {
  userId: string;
  displayName: string | null;
  email: string;
  active: boolean;
  hasPassword: boolean;
  scopeType: string | null;
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

function reasonOf(body: unknown): string | null | undefined {
  const raw =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).reason
      : undefined;
  return parseReason(raw);
}

/** Validates a body whose reason is required, as for deactivation. */
export function parseRequiredReasonInput(body: unknown): ParseResult<string> {
  const reason = reasonOf(body);
  return reason ? { ok: true, value: reason } : { ok: false, fieldErrors: { reason: 'invalid' } };
}

/** Validates a body whose reason is optional, as for reactivation; blank means none (`null`). */
export function parseOptionalReasonInput(body: unknown): ParseResult<string | null> {
  const reason = reasonOf(body);
  return reason === undefined
    ? { ok: false, fieldErrors: { reason: 'invalid' } }
    : { ok: true, value: reason };
}

/** An activation token as issued (64 lowercase hex characters), or `null`. */
export function parseActivationToken(value: unknown): string | null {
  return typeof value === 'string' && TOKEN.test(value) ? value : null;
}

/**
 * Groups role rows into one member per user. Global access wins over event roles; event lists are
 * sorted by name; a member with neither (no active role, or only roles for events that no longer
 * exist) has access `none`. Members are sorted by status (active, pending, no access,
 * deactivated), then by name.
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
      : events.size
        ? {
            kind: 'events',
            events: [...events.entries()]
              .map(([eventId, name]) => ({ id: eventId, name }))
              .sort((left, right) => left.name.localeCompare(right.name, 'es')),
          }
        : { kind: 'none' };
    const status = memberStatus(first.active, first.hasPassword, access.kind !== 'none');
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

  const order: Record<TeamMemberStatus, number> = {
    active: 0,
    pending: 1,
    no_access: 2,
    deactivated: 3,
  };
  return members.sort(
    (left, right) =>
      order[left.status] - order[right.status] ||
      left.displayName.localeCompare(right.displayName, 'es') ||
      left.email.localeCompare(right.email),
  );
}

/** Deactivation wins; then a member without access is `no_access`; then the password decides. */
export function memberStatus(
  active: boolean,
  hasPassword: boolean,
  hasAccess: boolean,
): TeamMemberStatus {
  if (!active) return 'deactivated';
  if (!hasAccess) return 'no_access';
  return hasPassword ? 'active' : 'pending';
}
