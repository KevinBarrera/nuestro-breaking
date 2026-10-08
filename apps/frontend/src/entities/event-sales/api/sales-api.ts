import { apiUrl } from '@/shared/api';
import { isEventSales } from './readers';
import type { EventSales, EventSalesInput, SalesFailure } from './types';

// Failures surface as a SalesError carrying only the status class, so screens show safe copy
// without echoing backend details. Same credentials and CSRF flow as the catalog client.
export class SalesError extends Error {
  readonly failure: SalesFailure;

  constructor(failure: SalesFailure) {
    super(`Sales request failed: ${failure}`);
    this.failure = failure;
  }
}

export function salesFailure(error: unknown): SalesFailure {
  return error instanceof SalesError ? error.failure : 'error';
}

function failureFor(status: number): SalesFailure {
  if (status === 401 || status === 403) return 'denied';
  if (status === 404) return 'not-found';
  if (status === 400) return 'invalid';
  return 'error';
}

const salesPath = (eventId: string) => `/admin/events/${encodeURIComponent(eventId)}/sales`;

async function request(path: string, init: RequestInit): Promise<EventSales> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { ...init, credentials: 'include' });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new SalesError('error');
  }
  if (!response.ok) throw new SalesError(failureFor(response.status));
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SalesError('error');
  }
  if (!isEventSales(body)) throw new SalesError('error');
  return body;
}

async function csrfToken(): Promise<string> {
  let session: Response;
  try {
    session = await fetch(apiUrl('/auth/session'), { credentials: 'include' });
  } catch {
    throw new SalesError('error');
  }
  if (session.status === 401 || session.status === 403) throw new SalesError('denied');
  const token = session.headers.get('X-CSRF-Token');
  if (!session.ok || !token) throw new SalesError('error');
  return token;
}

export function getEventSales(eventId: string, signal: AbortSignal): Promise<EventSales> {
  return request(salesPath(eventId), { signal });
}

// Replaces all three settings; the backend answers 400 for a bad date or window.
export async function updateEventSales(
  eventId: string,
  input: EventSalesInput,
): Promise<EventSales> {
  const token = await csrfToken();
  return request(salesPath(eventId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
    body: JSON.stringify(input),
  });
}
