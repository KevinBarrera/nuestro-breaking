import { apiUrl } from '@/shared/api';
import { readIssuedLink, readTeam, readTeamFailure } from './readers';
import type {
  InviteInput,
  IssuedLink,
  TeamAccessInput,
  TeamFailure,
  TeamMember,
  TeamMemberStatus,
} from './types';

// Failures surface as a TeamError carrying a safe, typed failure, so screens show Spanish copy
// without echoing backend details.
export class TeamError extends Error {
  readonly failure: TeamFailure;

  constructor(failure: TeamFailure) {
    super(`Team request failed: ${failure.kind}`);
    this.failure = failure;
  }
}

export function teamFailure(error: unknown): TeamFailure {
  return error instanceof TeamError ? error.failure : { kind: 'error' };
}

async function teamRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { ...init, credentials: 'include' });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new TeamError({ kind: 'error' });
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    if (response.ok) throw new TeamError({ kind: 'error' });
  }
  if (!response.ok) throw new TeamError(readTeamFailure(response.status, body));
  return body;
}

export async function listTeam(signal: AbortSignal): Promise<TeamMember[]> {
  const members = readTeam(await teamRequest('/admin/team', { signal }));
  if (!members) throw new TeamError({ kind: 'error' });
  return members;
}

// Mutations need the session's CSRF token, which `GET /auth/session` sends in a header.
async function csrfToken(): Promise<string> {
  let session: Response;
  try {
    session = await fetch(apiUrl('/auth/session'), { credentials: 'include' });
  } catch {
    throw new TeamError({ kind: 'error' });
  }
  if (session.status === 401 || session.status === 403) throw new TeamError({ kind: 'denied' });
  const token = session.headers.get('X-CSRF-Token');
  if (!session.ok || !token) throw new TeamError({ kind: 'error' });
  return token;
}

async function mutate(path: string, method: string, body?: unknown): Promise<unknown> {
  const token = await csrfToken();
  return teamRequest(path, {
    method,
    headers: {
      'X-CSRF-Token': token,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const memberPath = (userId: string, action: string) =>
  `/admin/team/${encodeURIComponent(userId)}/${action}`;

function issued(value: unknown): IssuedLink {
  const link = readIssuedLink(value);
  if (!link) throw new TeamError({ kind: 'error' });
  return link;
}

export async function inviteMember(input: InviteInput): Promise<IssuedLink> {
  return issued(await mutate('/admin/team', 'POST', input));
}

// Cancels any open link and issues a new one; for an active member it is the recovery path.
export async function regenerateInvitation(userId: string): Promise<IssuedLink> {
  return issued(await mutate(memberPath(userId, 'invitation'), 'POST'));
}

export async function cancelInvitation(userId: string): Promise<void> {
  await mutate(memberPath(userId, 'invitation'), 'DELETE');
}

// Resolves to whether anything changed (the same access again is a no-op).
export async function changeMemberAccess(
  userId: string,
  access: TeamAccessInput,
): Promise<boolean> {
  const body = await mutate(memberPath(userId, 'access'), 'PUT', { access });
  return typeof body === 'object' && body !== null && 'changed' in body && body.changed === true;
}

export async function deactivateMember(userId: string, reason: string): Promise<void> {
  await mutate(memberPath(userId, 'deactivate'), 'POST', { reason });
}

// Resolves to the new status: `active`, or `pending` for a member who never activated.
export async function reactivateMember(userId: string): Promise<TeamMemberStatus> {
  const body = await mutate(memberPath(userId, 'reactivate'), 'POST', {});
  return typeof body === 'object' && body !== null && 'status' in body && body.status === 'pending'
    ? 'pending'
    : 'active';
}
