import { apiUrl } from '@/shared/api';
import {
  isCheckout,
  isPaymentStatus,
  isPublicCatalog,
  isRegistration,
  readFailure,
} from './readers';
import type {
  Checkout,
  PaymentStatus,
  PublicCatalog,
  PublicEventFailure,
  Registration,
  RegistrationRequest,
} from './types';

// Public endpoints never use the admin session: no cookies (`credentials: 'omit'`, the public
// CORS rules never allow them) and no CSRF token. Failures surface as a PublicEventError.
export class PublicEventError extends Error {
  readonly failure: PublicEventFailure;

  constructor(failure: PublicEventFailure) {
    super(`Public event request failed: ${failure.kind}`);
    this.failure = failure;
  }
}

export function publicEventFailure(error: unknown): PublicEventFailure {
  return error instanceof PublicEventError ? error.failure : { kind: 'error' };
}

const eventPath = (slug: string, rest: string) =>
  `/public/events/${encodeURIComponent(slug)}/${rest}`;

// `json`, when given, is sent as a JSON POST body.
async function send<T>(
  path: string,
  { signal, json }: { signal?: AbortSignal; json?: unknown },
  isValid: (body: unknown) => body is T,
): Promise<T> {
  // An abort is passed through untouched, so callers can ignore it.
  const rethrowAbort = (error: unknown) => {
    if (signal?.aborted) throw error;
  };
  const post = json !== undefined;
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method: post ? 'POST' : 'GET',
      credentials: 'omit',
      headers: post
        ? { Accept: 'application/json', 'Content-Type': 'application/json' }
        : { Accept: 'application/json' },
      body: post ? JSON.stringify(json) : undefined,
      signal,
    });
  } catch (error) {
    rethrowAbort(error);
    throw new PublicEventError({ kind: 'error' });
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch (error) {
    rethrowAbort(error);
    if (response.ok) throw new PublicEventError({ kind: 'error' });
  }
  if (!response.ok) throw new PublicEventError(readFailure(response.status, body));
  if (!isValid(body)) throw new PublicEventError({ kind: 'error' });
  return body;
}

export function getPublicCatalog(slug: string, signal?: AbortSignal): Promise<PublicCatalog> {
  return send(eventPath(slug, 'catalog'), { signal }, isPublicCatalog);
}

// Creates (or reuses) one pending registration; the response never says which.
export function createRegistration(
  slug: string,
  request: RegistrationRequest,
  signal?: AbortSignal,
): Promise<Registration> {
  return send(eventPath(slug, 'registrations'), { signal, json: request }, isRegistration);
}

// Starts a Mercado Pago checkout for a pending registration of this event. Each call creates a
// new preference, so retrying after a failure is safe; nothing is charged until the buyer pays.
export function createCheckout(
  slug: string,
  registrationId: string,
  signal?: AbortSignal,
): Promise<Checkout> {
  const path = eventPath(slug, `registrations/${encodeURIComponent(registrationId)}/checkout`);
  return send(path, { signal, json: {} }, isCheckout);
}

// The result the return page shows for one registration of this event (#178). It only reads and
// keeps answering after sales close; an unknown registration is a neutral 404 (`not-found`).
export function getPaymentStatus(
  slug: string,
  registrationId: string,
  signal?: AbortSignal,
): Promise<PaymentStatus> {
  const path = eventPath(
    slug,
    `registrations/${encodeURIComponent(registrationId)}/payment-status`,
  );
  return send(path, { signal }, isPaymentStatus);
}
