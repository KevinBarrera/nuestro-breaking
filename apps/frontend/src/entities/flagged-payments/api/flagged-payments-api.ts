import { apiUrl } from '@/shared/api';
import { isFlaggedPayments } from './readers';
import type { FlaggedPayments, FlaggedPaymentsFailure } from './types';

// Failures carry only the status class, so the screen shows safe copy without backend details.
export class FlaggedPaymentsError extends Error {
  readonly failure: FlaggedPaymentsFailure;

  constructor(failure: FlaggedPaymentsFailure) {
    super(`Flagged payments request failed: ${failure}`);
    this.failure = failure;
  }
}

export function flaggedPaymentsFailure(error: unknown): FlaggedPaymentsFailure {
  return error instanceof FlaggedPaymentsError ? error.failure : 'error';
}

function failureFor(status: number): FlaggedPaymentsFailure {
  if (status === 401 || status === 403) return 'denied';
  if (status === 404) return 'not-found';
  return 'error';
}

export async function getFlaggedPayments(
  eventId: string,
  signal: AbortSignal,
): Promise<FlaggedPayments> {
  let response: Response;
  try {
    response = await fetch(
      apiUrl(`/admin/events/${encodeURIComponent(eventId)}/flagged-payments`),
      { credentials: 'include', signal },
    );
  } catch (error) {
    if (signal.aborted) throw error;
    throw new FlaggedPaymentsError('error');
  }
  if (!response.ok) throw new FlaggedPaymentsError(failureFor(response.status));
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new FlaggedPaymentsError('error');
  }
  if (!isFlaggedPayments(body)) throw new FlaggedPaymentsError('error');
  return body;
}
