import { apiUrl } from '@/shared/api';
import { readHistoryPage } from './readers';
import type { HistoryPage, HistoryQuery, RegistrationHistoryFailure } from './types';

// Failures carry only the status class, so the screen shows safe copy without backend details.
export class RegistrationHistoryError extends Error {
  readonly failure: RegistrationHistoryFailure;

  constructor(failure: RegistrationHistoryFailure) {
    super(`Registration history request failed: ${failure}`);
    this.failure = failure;
  }
}

export function registrationHistoryFailure(error: unknown): RegistrationHistoryFailure {
  return error instanceof RegistrationHistoryError ? error.failure : 'error';
}

function failureFor(status: number): RegistrationHistoryFailure {
  if (status === 401 || status === 403) return 'denied';
  if (status === 404) return 'not-found';
  return 'error';
}

// One page of the history (50 by the backend default); `cursor` is the `nextCursor` of the
// page before, and `q` the search (#356).
export async function getRegistrationHistory(
  eventId: string,
  query: HistoryQuery,
  signal: AbortSignal,
): Promise<HistoryPage> {
  const params = new URLSearchParams({ filter: query.filter });
  if (query.q) params.set('q', query.q);
  if (query.cursor) params.set('cursor', query.cursor);
  let response: Response;
  try {
    response = await fetch(
      apiUrl(`/admin/events/${encodeURIComponent(eventId)}/registration-history?${params}`),
      { credentials: 'include', signal },
    );
  } catch (error) {
    if (signal.aborted) throw error;
    throw new RegistrationHistoryError('error');
  }
  if (!response.ok) throw new RegistrationHistoryError(failureFor(response.status));
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new RegistrationHistoryError('error');
  }
  const page = readHistoryPage(body);
  if (!page) throw new RegistrationHistoryError('error');
  return page;
}
