import { apiUrl } from '@/shared/api';
import { readAttendeeLists } from './readers';
import type { AttendeeLists, AttendeeListsFailure } from './types';

// Failures carry only the status class, so the screen shows safe copy without backend details.
export class AttendeeListsError extends Error {
  readonly failure: AttendeeListsFailure;

  constructor(failure: AttendeeListsFailure) {
    super(`Attendee lists request failed: ${failure}`);
    this.failure = failure;
  }
}

export function attendeeListsFailure(error: unknown): AttendeeListsFailure {
  return error instanceof AttendeeListsError ? error.failure : 'error';
}

function failureFor(status: number): AttendeeListsFailure {
  if (status === 401 || status === 403) return 'denied';
  if (status === 404) return 'not-found';
  return 'error';
}

export async function fetchAttendeeLists(
  eventId: string,
  signal: AbortSignal,
): Promise<AttendeeLists> {
  let response: Response;
  try {
    response = await fetch(apiUrl(`/admin/events/${encodeURIComponent(eventId)}/attendee-lists`), {
      credentials: 'include',
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new AttendeeListsError('error');
  }
  if (!response.ok) throw new AttendeeListsError(failureFor(response.status));
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AttendeeListsError('error');
  }
  const lists = readAttendeeLists(body);
  if (!lists) throw new AttendeeListsError('error');
  return lists;
}
