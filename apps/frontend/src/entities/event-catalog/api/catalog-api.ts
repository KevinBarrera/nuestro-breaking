import { apiUrl } from '@/shared/api';
import {
  isCatalogActivity,
  isCatalogEventSummary,
  isCatalogPassType,
  readEventContext,
} from './readers';
import type {
  ActivityInput,
  CatalogActivity,
  CatalogEventContext,
  CatalogEventSummary,
  CatalogFailure,
  CatalogPassType,
  PassTypeActivity,
  PassTypeInput,
} from './types';

// Every failure surfaces as a CatalogError so screens can show a safe, status-based message
// without echoing backend details.
export class CatalogError extends Error {
  readonly failure: CatalogFailure;

  constructor(failure: CatalogFailure) {
    super(`Catalog request failed: ${failure}`);
    this.failure = failure;
  }
}

export function catalogFailure(error: unknown): CatalogFailure {
  return error instanceof CatalogError ? error.failure : 'error';
}

function failureFor(status: number): CatalogFailure {
  if (status === 401 || status === 403) return 'denied';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if (status === 400) return 'invalid';
  return 'error';
}

function eventPath(eventId: string, suffix: string) {
  return `/admin/events/${encodeURIComponent(eventId)}${suffix}`;
}

async function request(path: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { ...init, credentials: 'include' });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new CatalogError('error');
  }
  if (!response.ok) throw new CatalogError(failureFor(response.status));
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new CatalogError('error');
  }
}

async function csrfToken(): Promise<string> {
  let session: Response;
  try {
    session = await fetch(apiUrl('/auth/session'), { credentials: 'include' });
  } catch {
    throw new CatalogError('error');
  }
  if (session.status === 401 || session.status === 403) throw new CatalogError('denied');
  const token = session.headers.get('X-CSRF-Token');
  if (!session.ok || !token) throw new CatalogError('error');
  return token;
}

async function write(path: string, method: 'POST' | 'PATCH' | 'PUT', body: unknown) {
  const token = await csrfToken();
  return request(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
    body: JSON.stringify(body),
  });
}

function ensure<T>(value: unknown, guard: (value: unknown) => value is T): T {
  if (!guard(value)) throw new CatalogError('error');
  return value;
}

export async function listCatalogEvents(signal: AbortSignal): Promise<CatalogEventSummary[]> {
  const rows = await request('/admin/events', { signal });
  const guard = (value: unknown): value is CatalogEventSummary[] =>
    Array.isArray(value) && value.every(isCatalogEventSummary);
  return ensure(rows, guard);
}

export async function readCatalogEventContext(
  eventId: string,
  signal: AbortSignal,
): Promise<CatalogEventContext> {
  const context = readEventContext(await request(eventPath(eventId, '/foundation'), { signal }));
  if (!context) throw new CatalogError('error');
  return context;
}

export async function listActivities(
  eventId: string,
  signal: AbortSignal,
): Promise<CatalogActivity[]> {
  const rows = await request(eventPath(eventId, '/activities'), { signal });
  const guard = (value: unknown): value is CatalogActivity[] =>
    Array.isArray(value) && value.every((row) => isCatalogActivity(row, eventId));
  return ensure(rows, guard);
}

const activityGuard =
  (eventId: string) =>
  (value: unknown): value is CatalogActivity =>
    isCatalogActivity(value, eventId);

export async function createActivity(eventId: string, input: ActivityInput) {
  return ensure(
    await write(eventPath(eventId, '/activities'), 'POST', input),
    activityGuard(eventId),
  );
}

export async function updateActivity(
  eventId: string,
  activityId: string,
  expectedVersion: number,
  input: ActivityInput,
) {
  const path = eventPath(eventId, `/activities/${encodeURIComponent(activityId)}`);
  return ensure(await write(path, 'PATCH', { expectedVersion, ...input }), activityGuard(eventId));
}

export async function archiveActivity(
  eventId: string,
  activityId: string,
  expectedVersion: number,
) {
  const path = eventPath(eventId, `/activities/${encodeURIComponent(activityId)}/archive`);
  return ensure(await write(path, 'POST', { expectedVersion }), activityGuard(eventId));
}

const passTypeGuard =
  (eventId: string) =>
  (value: unknown): value is CatalogPassType =>
    isCatalogPassType(value, eventId);

export async function listPassTypes(
  eventId: string,
  signal: AbortSignal,
): Promise<CatalogPassType[]> {
  const rows = await request(eventPath(eventId, '/pass-types'), { signal });
  const guard = (value: unknown): value is CatalogPassType[] =>
    Array.isArray(value) && value.every((row) => isCatalogPassType(row, eventId));
  return ensure(rows, guard);
}

export async function createPassType(eventId: string, input: PassTypeInput) {
  return ensure(
    await write(eventPath(eventId, '/pass-types'), 'POST', input),
    passTypeGuard(eventId),
  );
}

export async function updatePassType(
  eventId: string,
  passTypeId: string,
  expectedVersion: number,
  input: PassTypeInput,
) {
  const path = eventPath(eventId, `/pass-types/${encodeURIComponent(passTypeId)}`);
  return ensure(await write(path, 'PATCH', { expectedVersion, ...input }), passTypeGuard(eventId));
}

export async function replacePassTypeActivities(
  eventId: string,
  passTypeId: string,
  expectedVersion: number,
  activities: PassTypeActivity[],
) {
  const path = eventPath(eventId, `/pass-types/${encodeURIComponent(passTypeId)}/activities`);
  return ensure(await write(path, 'PUT', { expectedVersion, activities }), passTypeGuard(eventId));
}

export async function archivePassType(
  eventId: string,
  passTypeId: string,
  expectedVersion: number,
) {
  const path = eventPath(eventId, `/pass-types/${encodeURIComponent(passTypeId)}/archive`);
  return ensure(await write(path, 'POST', { expectedVersion }), passTypeGuard(eventId));
}
