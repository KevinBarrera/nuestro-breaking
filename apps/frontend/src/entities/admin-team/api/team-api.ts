import { apiUrl } from '@/shared/api';
import { readTeam, readTeamFailure } from './readers';
import type { TeamFailure, TeamMember } from './types';

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

export async function teamRequest(path: string, init: RequestInit = {}): Promise<unknown> {
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
