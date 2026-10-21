import { apiUrl } from '@/shared/api';
import {
  readConfirmation,
  readEntitlements,
  readManualRegistration,
  readRegistrationFailure,
  readSearchPage,
} from './readers';
import type {
  AdminRegistrationFailure,
  CashConfirmation,
  CashPaymentInput,
  ComplimentaryConfirmation,
  ComplimentaryConfirmationInput,
  ManualRegistration,
  ManualRegistrationInput,
  RegistrationEntitlements,
  RegistrationSearchPage,
  RegistrationSearchQuery,
} from './types';

// Failures surface as an AdminRegistrationError carrying a safe, typed failure, so screens show
// Spanish copy without echoing backend details.
export class AdminRegistrationError extends Error {
  readonly failure: AdminRegistrationFailure;

  constructor(failure: AdminRegistrationFailure) {
    super(`Admin registration request failed: ${failure.kind}`);
    this.failure = failure;
  }
}

export function adminRegistrationFailure(error: unknown): AdminRegistrationFailure {
  return error instanceof AdminRegistrationError ? error.failure : { kind: 'error' };
}

// A write whose answer is lost or unreadable may have been applied, so it is reported as
// `unknown`, never as a failure the user could safely retry. A lost read is a plain `error`.
async function registrationRequest(
  path: string,
  init: RequestInit & { write?: boolean } = {},
): Promise<unknown> {
  const { write = false, ...request } = init;
  const lost = (): AdminRegistrationFailure => ({ kind: write ? 'unknown' : 'error' });
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { ...request, credentials: 'include' });
  } catch (error) {
    if (request.signal?.aborted) throw error;
    throw new AdminRegistrationError(lost());
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    if (response.ok) throw new AdminRegistrationError(lost());
  }
  if (!response.ok)
    throw new AdminRegistrationError(readRegistrationFailure(response.status, body));
  return body;
}

// Writes need the session's CSRF token, which `GET /auth/session` sends in a header.
async function csrfToken(): Promise<string> {
  let session: Response;
  try {
    session = await fetch(apiUrl('/auth/session'), { credentials: 'include' });
  } catch {
    throw new AdminRegistrationError({ kind: 'error' });
  }
  if (session.status === 401) throw new AdminRegistrationError({ kind: 'unauthorized' });
  if (session.status === 403) throw new AdminRegistrationError({ kind: 'forbidden' });
  const token = session.headers.get('X-CSRF-Token');
  if (!session.ok || !token) throw new AdminRegistrationError({ kind: 'error' });
  return token;
}

async function mutate(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<unknown> {
  const token = await csrfToken();
  if (body === undefined)
    return registrationRequest(path, { method, headers: { 'X-CSRF-Token': token }, write: true });
  return registrationRequest(path, {
    method,
    headers: { 'X-CSRF-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    write: true,
  });
}

function read<T>(value: T | null): T {
  if (value === null) throw new AdminRegistrationError({ kind: 'error' });
  return value;
}

function written<T>(value: T | null): T {
  if (value === null) throw new AdminRegistrationError({ kind: 'unknown' });
  return value;
}

const eventPath = (eventId: string, suffix: string) =>
  `/admin/events/${encodeURIComponent(eventId)}${suffix}`;

const registrationPath = (eventId: string, registrationId: string, suffix: string) =>
  eventPath(eventId, `/registrations/${encodeURIComponent(registrationId)}${suffix}`);

// Registrations of the event whose participant name, email or AKA, folio or cash receipt
// number contains `q`. A query outside 2 to 200 characters is rejected without a request.
export async function searchRegistrations(
  eventId: string,
  { q, limit, offset }: RegistrationSearchQuery,
  signal: AbortSignal,
): Promise<RegistrationSearchPage> {
  const query = q.trim();
  if (query.length < 2 || query.length > 200)
    throw new AdminRegistrationError({ kind: 'invalid', fieldErrors: { q: 'invalid' } });
  const params = new URLSearchParams({ q: query });
  if (limit !== undefined) params.set('limit', String(limit));
  if (offset !== undefined) params.set('offset', String(offset));
  const path = eventPath(eventId, `/participants?${params.toString()}`);
  return read(readSearchPage(await registrationRequest(path, { signal }), eventId));
}

// The registration's held passes and the activities they give access to.
export async function getRegistrationEntitlements(
  eventId: string,
  registrationId: string,
  signal: AbortSignal,
): Promise<RegistrationEntitlements> {
  const path = registrationPath(eventId, registrationId, '/entitlements');
  return read(readEntitlements(await registrationRequest(path, { signal }), registrationId));
}

const participantFields = [
  'firstName',
  'firstLastName',
  'secondLastName',
  'stageName',
  'email',
  'phone',
  'city',
  'instagram',
  'level',
  'birthDate',
] as const;

// Creates a new participant and a `pending_payment` registration. When the event already has
// registrations with the same email or phone, it answers `possible_duplicates`; send the same
// input again with their ids in `confirmedDuplicateRegistrationIds` to go ahead.
export async function createManualRegistration(
  eventId: string,
  input: ManualRegistrationInput,
  { confirmedDuplicateRegistrationIds }: { confirmedDuplicateRegistrationIds?: string[] } = {},
): Promise<ManualRegistration> {
  // Only the participant fields are copied, so activity ids or extra keys are never sent.
  const body: Record<string, unknown> = {};
  for (const field of participantFields) if (input[field] !== undefined) body[field] = input[field];
  if (confirmedDuplicateRegistrationIds)
    body.confirmedDuplicateRegistrationIds = confirmedDuplicateRegistrationIds;
  const path = eventPath(eventId, '/registrations/manual');
  return written(readManualRegistration(await mutate(path, 'POST', body), eventId));
}

// Adds a pass to a `pending_payment` registration at the pass type's current price.
export async function addRegistrationPass(
  eventId: string,
  registrationId: string,
  passTypeId: string,
): Promise<RegistrationEntitlements> {
  const path = registrationPath(eventId, registrationId, '/passes');
  return written(readEntitlements(await mutate(path, 'POST', { passTypeId }), registrationId));
}

// Replaces the selected activities of a held pass; an empty list clears them. A confirmed
// registration needs the change `reason` (1 to 500 characters once trimmed, #170); it is sent only
// when given, so the pending sale keeps saving without one.
export async function setPassSelections(
  eventId: string,
  registrationId: string,
  registrationPassId: string,
  activityIds: string[],
  { reason }: { reason?: string } = {},
): Promise<RegistrationEntitlements> {
  const path = registrationPath(
    eventId,
    registrationId,
    `/passes/${encodeURIComponent(registrationPassId)}/selections`,
  );
  const body: Record<string, unknown> = { activityIds };
  if (reason !== undefined) body.reason = reason;
  return written(readEntitlements(await mutate(path, 'PUT', body), registrationId));
}

// Removes a held pass and its selections from an in-person `pending_payment` registration (#282).
export async function removeRegistrationPass(
  eventId: string,
  registrationId: string,
  registrationPassId: string,
): Promise<RegistrationEntitlements> {
  const path = registrationPath(
    eventId,
    registrationId,
    `/passes/${encodeURIComponent(registrationPassId)}`,
  );
  return written(readEntitlements(await mutate(path, 'DELETE'), registrationId));
}

// Records cash received in person and confirms the pending registration, which gets its folio.
export async function confirmCashPayment(
  eventId: string,
  registrationId: string,
  { amountCents, receipt, reference, note }: CashPaymentInput,
): Promise<CashConfirmation> {
  const body: Record<string, unknown> = { amount: amountCents, receipt };
  if (reference !== undefined) body.reference = reference;
  if (note !== undefined) body.note = note;
  const path = registrationPath(eventId, registrationId, '/cash-confirmation');
  return written(readConfirmation(await mutate(path, 'POST', body), eventId, registrationId));
}

// Confirms a pending registration whose passes total $0 without payment (#263); it gets its folio
// and the confirmation email.
export async function confirmComplimentary(
  eventId: string,
  registrationId: string,
  { reason }: ComplimentaryConfirmationInput,
): Promise<ComplimentaryConfirmation> {
  const path = registrationPath(eventId, registrationId, '/complimentary-confirmation');
  return written(readConfirmation(await mutate(path, 'POST', { reason }), eventId, registrationId));
}
