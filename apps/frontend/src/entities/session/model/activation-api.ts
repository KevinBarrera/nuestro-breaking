import { apiUrl } from '@/shared/api';

// Public account activation (#214). The token travels only in the JSON body, never in a URL,
// and no cookie is sent: the person is not signed in yet.
export type ActivationDetails = { displayName: string; email: string; expiresAt: string };

// `invalid-link` is the single 410 for every unusable link (D8); `weak-password` carries the
// backend's failed rule ids.
export type ActivationFailure =
  { kind: 'invalid-link' } | { kind: 'weak-password'; failedRules: string[] } | { kind: 'error' };

export class ActivationError extends Error {
  readonly failure: ActivationFailure;

  constructor(failure: ActivationFailure) {
    super(`Activation failed: ${failure.kind}`);
    this.failure = failure;
  }
}

export function activationFailure(error: unknown): ActivationFailure {
  return error instanceof ActivationError ? error.failure : { kind: 'error' };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export function readActivationFailure(status: number, body: unknown): ActivationFailure {
  if (status === 410) return { kind: 'invalid-link' };
  if (status === 400 && isRecord(body) && Array.isArray(body.failedRules))
    return {
      kind: 'weak-password',
      failedRules: body.failedRules.filter((rule): rule is string => typeof rule === 'string'),
    };
  return { kind: 'error' };
}

export function readActivationDetails(body: unknown): ActivationDetails | null {
  if (!isRecord(body)) return null;
  const { displayName, email, expiresAt } = body;
  if (typeof displayName !== 'string' || typeof email !== 'string') return null;
  if (typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) return null;
  return { displayName, email, expiresAt };
}

async function post(path: string, payload: unknown, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ActivationError({ kind: 'error' });
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ActivationError(readActivationFailure(response.status, body));
  return body;
}

export async function checkActivation(
  token: string,
  signal: AbortSignal,
): Promise<ActivationDetails> {
  const details = readActivationDetails(await post('/auth/activation/check', { token }, signal));
  if (!details) throw new ActivationError({ kind: 'error' });
  return details;
}

export async function activateAccount(token: string, password: string): Promise<void> {
  await post('/auth/activation', { token, password });
}
