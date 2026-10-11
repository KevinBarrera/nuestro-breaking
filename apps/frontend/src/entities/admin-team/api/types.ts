// Team management API shapes (#214); see docs/contracts/admin-auth-boundary.md.
export type TeamEvent = { id: string; name: string };

export type TeamAccess = { kind: 'global' } | { kind: 'events'; events: TeamEvent[] };

export const teamMemberStatuses = ['active', 'pending', 'deactivated'] as const;
export type TeamMemberStatus = (typeof teamMemberStatuses)[number];

export type TeamInvitation = { expiresAt: string; expired: boolean };

export type TeamMember = {
  id: string;
  displayName: string;
  email: string;
  status: TeamMemberStatus;
  access: TeamAccess;
  // The open invitation; always null for a deactivated member.
  invitation: TeamInvitation | null;
};

// What an invite or a regenerated link returns. The link is shown once and never stored.
export type IssuedLink = { userId: string; activationUrl: string; expiresAt: string };

// `access` as the invite and change-access requests send it.
export type TeamAccessInput = { kind: 'global' } | { kind: 'events'; eventIds: string[] };

export type InviteInput = { displayName: string; email: string; access: TeamAccessInput };

// 404 and 409 `code` values the team endpoints answer with.
export const teamErrorCodes = [
  'member_not_found',
  'no_open_invitation',
  'email_in_use',
  'member_deactivated',
  'member_active',
  'self_change',
  'self_deactivation',
  'last_global_admin',
] as const;
export type TeamErrorCode = (typeof teamErrorCodes)[number];

// `denied` covers 401 and 403: a missing session, a lost global admin role, or a failed
// origin or CSRF check. `invalid` carries the 400 `fieldErrors` (never the submitted values).
export type TeamFailure =
  | { kind: 'denied' }
  | { kind: 'invalid'; fieldErrors: Record<string, string> }
  | { kind: 'rule'; code: TeamErrorCode }
  | { kind: 'error' };
