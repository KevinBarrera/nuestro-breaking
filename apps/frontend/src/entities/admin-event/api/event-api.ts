import { apiUrl } from '@/shared/api';
import { readAdminEvent, readEventFailure, readEventList, readVenue } from './readers';
import type {
  AdminEvent,
  AdminEventFailure,
  AdminVenue,
  CreateEventInput,
  UpdateEventInput,
} from './types';

// Failures surface as an AdminEventError carrying a safe, typed failure, so screens show
// Spanish copy without echoing backend details.
export class AdminEventError extends Error {
  readonly failure: AdminEventFailure;

  constructor(failure: AdminEventFailure) {
    super(`Admin event request failed: ${failure.kind}`);
    this.failure = failure;
  }
}

export function adminEventFailure(error: unknown): AdminEventFailure {
  return error instanceof AdminEventError ? error.failure : { kind: 'error' };
}

async function eventRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { ...init, credentials: 'include' });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    // The request may have reached the server before the connection failed.
    throw new AdminEventError({ kind: 'unknown' });
  }
  if (response.status === 204) return null;
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    if (response.ok) throw new AdminEventError({ kind: 'unknown' });
  }
  if (!response.ok) throw new AdminEventError(readEventFailure(response.status, body));
  return body;
}

// The events this account may manage, ordered by name. Archived events are included only
// with `archived: true`.
export async function listAdminEvents(
  signal: AbortSignal,
  { archived = false }: { archived?: boolean } = {},
): Promise<AdminEvent[]> {
  const path = archived ? '/admin/events?archived=true' : '/admin/events';
  const events = readEventList(await eventRequest(path, { signal }));
  if (!events) throw new AdminEventError({ kind: 'error' });
  return events;
}

// Writes need the session's CSRF token, which `GET /auth/session` sends in a header.
async function csrfToken(): Promise<string> {
  let session: Response;
  try {
    session = await fetch(apiUrl('/auth/session'), { credentials: 'include' });
  } catch {
    throw new AdminEventError({ kind: 'error' });
  }
  if (session.status === 401) throw new AdminEventError({ kind: 'unauthorized' });
  if (session.status === 403) throw new AdminEventError({ kind: 'forbidden' });
  const token = session.headers.get('X-CSRF-Token');
  if (!session.ok || !token) throw new AdminEventError({ kind: 'error' });
  return token;
}

async function mutate(path: string, method: string, body?: unknown): Promise<unknown> {
  const token = await csrfToken();
  return eventRequest(path, {
    method,
    headers: {
      'X-CSRF-Token': token,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const eventPath = (eventId: string, suffix = '') =>
  `/admin/events/${encodeURIComponent(eventId)}${suffix}`;

// A 2xx answer that cannot be read means the write may have been applied, so it is reported
// as `unknown`, never as a failure the user could safely retry.
function written<T>(value: T | null): T {
  if (value === null) throw new AdminEventError({ kind: 'unknown' });
  return value;
}

export async function createEvent(input: CreateEventInput): Promise<AdminEvent> {
  return written(readAdminEvent(await mutate('/admin/events', 'POST', input)));
}

export async function updateEvent(eventId: string, input: UpdateEventInput): Promise<AdminEvent> {
  return written(readAdminEvent(await mutate(eventPath(eventId), 'PATCH', input)));
}

// Closes sales and hides the event from the public site; its data stays readable.
export async function archiveEvent(eventId: string): Promise<AdminEvent> {
  return written(readAdminEvent(await mutate(eventPath(eventId, '/archive'), 'POST')));
}

// Brings an archived event back with sales still closed.
export async function restoreEvent(eventId: string): Promise<AdminEvent> {
  return written(readAdminEvent(await mutate(eventPath(eventId, '/restore'), 'POST')));
}

// Only an empty event can be deleted, and only with its exact slug typed again.
export async function deleteEvent(eventId: string, confirmSlug: string): Promise<void> {
  await mutate(eventPath(eventId), 'DELETE', { confirmSlug });
}

export async function createVenue(eventId: string, name: string): Promise<AdminVenue> {
  return written(readVenue(await mutate(eventPath(eventId, '/venues'), 'POST', { name })));
}

export async function renameVenue(
  eventId: string,
  venueId: string,
  name: string,
): Promise<AdminVenue> {
  const path = eventPath(eventId, `/venues/${encodeURIComponent(venueId)}`);
  return written(readVenue(await mutate(path, 'PATCH', { name })));
}
