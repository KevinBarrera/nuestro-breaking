import type { Page } from '@playwright/test';
import { activeEventId, eventSummary, mockSession } from './event-mocks.ts';

// Mocked admin registration API (#105): search, entitlements, the manual registration, the
// event's pass types and activities, adding a pass and replacing a pass's selections.
// Each handler answers per request, and the helper returns what the screens sent.
const api = (url: URL) => url.port === '3000';

export const eventId = activeEventId;
export const registrationId = 'c1b2c3d4-1234-4567-89ab-123456789abc';
export const otherRegistrationId = 'c2b2c3d4-1234-4567-89ab-123456789abc';
export const thirdRegistrationId = 'c3b2c3d4-1234-4567-89ab-123456789abc';

export const registrationsPath = `/admin/events/${eventId}/registrations`;
export const newRegistrationPath = `${registrationsPath}/new`;
export const registrationPath = (id: string) => `${registrationsPath}/${id}`;

export const searchResult = (
  id: string,
  fullName: string,
  overrides: { stageName?: string | null; folio?: string | null; status?: string } = {},
) => ({
  participant: {
    id: `participant-${id}`,
    fullName,
    email: 'persona@example.org',
    stageName: overrides.stageName ?? null,
  },
  registration: {
    id,
    eventId,
    folio: overrides.folio ?? null,
    status: overrides.status ?? 'pending_payment',
    checkedInAt: null,
  },
  activities: [] as { id: string; name: string; kind: string; checkedInAt: null }[],
});

export const searchPage = (
  results: ReturnType<typeof searchResult>[],
  { total = results.length, offset = 0 } = {},
) => ({ total, limit: 20, offset, results });

export const heldPass = {
  registrationPassId: 'f9b2c3d4-1234-4567-89ab-123456789abc',
  passTypeId: 'f1b2c3d4-1234-4567-89ab-123456789abc',
  name: 'Pase completo',
  passClass: 'full',
  priceCents: 150000,
  selections: [],
};

// A catalog pass type as `GET /admin/events/:eventId/pass-types` lists it.
export const catalogPassType = (
  id: string,
  name: string,
  passClass: string,
  priceCents: number,
  overrides: {
    requiresPassClass?: string | null;
    status?: string;
    activities?: { activityId: string; access: string }[];
  } = {},
) => ({
  id,
  eventId,
  name,
  passClass,
  priceCents,
  requiresPassClass: overrides.requiresPassClass ?? null,
  onlineSalesClosesAt: null,
  status: overrides.status ?? 'active',
  version: 1,
  activities: overrides.activities ?? [],
});

// A catalog activity as `GET /admin/events/:eventId/activities` lists it.
export const catalogActivity = (
  id: string,
  name: string,
  startsAt: string,
  overrides: { status?: string } = {},
) => ({
  id,
  eventId,
  venueId: 'a9b2c3d4-1234-4567-89ab-123456789abc',
  kind: 'competition',
  name,
  startsAt,
  endsAt: startsAt,
  status: overrides.status ?? 'active',
  version: 1,
});

export const created = (id = registrationId) => ({
  registrationId: id,
  participantId: 'participant-new',
  eventId,
  status: 'pending_payment',
  auditId: 'audit-1',
});

export const duplicateMatch = (id: string, overrides: Record<string, unknown> = {}) => ({
  registrationId: id,
  fullName: 'Alex Rivera',
  stageName: 'Flash',
  folio: null,
  status: 'pending_payment',
  maskedEmail: 'a***@example.com',
  maskedPhone: '******4567',
  ...overrides,
});

export const possibleDuplicates = (matches: ReturnType<typeof duplicateMatch>[]) => ({
  status: 409,
  json: {
    statusCode: 409,
    message: 'Possible duplicate registrations need confirmation',
    code: 'possible_duplicates',
    matches,
  },
});

// The summary every entitlements answer carries: pending, no folio, the created participant.
export const registrationSummary = (
  id: string,
  overrides: {
    status?: string;
    folio?: string | null;
    fullName?: string;
    stageName?: string | null;
  } = {},
) => ({
  id,
  status: overrides.status ?? 'pending_payment',
  folio: overrides.folio ?? null,
  participant: {
    fullName: overrides.fullName ?? 'Ana López',
    stageName: overrides.stageName ?? null,
  },
});

type Answer = { status?: number; json?: unknown; abort?: boolean };

// Every entitlements answer names its registration (#105); specs only set the passes.
function withSummary(id: string, answer: Answer): Answer {
  const json = answer.json as Record<string, unknown> | undefined;
  return json && Array.isArray(json.passes) && !('registration' in json)
    ? { ...answer, json: { registration: registrationSummary(id), ...json } }
    : answer;
}

export type RegistrationMocks = {
  search?: (url: URL) => Answer;
  entitlements?: (id: string) => Answer;
  // `attempt` counts the POSTs, starting at 1.
  create?: (attempt: number) => Answer;
  passTypes?: () => Answer;
  // `attempt` counts the POSTs, starting at 1.
  addPass?: (attempt: number) => Answer;
  activities?: () => Answer;
  // `attempt` counts the PUTs, starting at 1.
  selections?: (attempt: number) => Answer;
};

export type SentCreate = { body: Record<string, unknown>; csrf: string | null };
export type SentPass = { registrationId: string; body: unknown; csrf: string | null };
export type SentSelections = SentPass & { registrationPassId: string };

export async function mockRegistrations(page: Page, mocks: RegistrationMocks = {}) {
  const searches: URL[] = [];
  const creates: SentCreate[] = [];
  const addedPasses: SentPass[] = [];
  const selections: SentSelections[] = [];
  await mockSession(page);
  await page.route(
    (url) => api(url) && url.pathname === '/admin/events',
    (route) => route.fulfill({ json: [eventSummary(eventId, 'Encuentro del barrio')] }),
  );
  const fulfill = async (
    route: Parameters<Parameters<Page['route']>[1]>[0],
    { status = 200, json, abort }: Answer,
  ) => (abort ? route.abort('failed') : route.fulfill({ status, json }));
  await page.route(
    (url) => api(url) && url.pathname === `/admin/events/${eventId}/participants`,
    (route) => {
      const url = new URL(route.request().url());
      searches.push(url);
      return fulfill(route, mocks.search?.(url) ?? { json: searchPage([]) });
    },
  );
  await page.route(
    (url) =>
      api(url) && /^\/admin\/events\/[^/]+\/registrations\/[^/]+\/entitlements$/.test(url.pathname),
    (route) => {
      const id = new URL(route.request().url()).pathname.split('/')[5];
      const answer = mocks.entitlements?.(id) ?? {
        json: { passes: [], accessibleActivityIds: [] },
      };
      return fulfill(route, withSummary(id, answer));
    },
  );
  await page.route(
    (url) => api(url) && url.pathname === `/admin/events/${eventId}/registrations/manual`,
    (route) => {
      const request = route.request();
      creates.push({
        body: request.postDataJSON() as Record<string, unknown>,
        csrf: request.headers()['x-csrf-token'] ?? null,
      });
      return fulfill(route, mocks.create?.(creates.length) ?? { status: 201, json: created() });
    },
  );
  await page.route(
    (url) => api(url) && url.pathname === `/admin/events/${eventId}/pass-types`,
    (route) => fulfill(route, mocks.passTypes?.() ?? { json: [] }),
  );
  await page.route(
    (url) =>
      api(url) && /^\/admin\/events\/[^/]+\/registrations\/[^/]+\/passes$/.test(url.pathname),
    (route) => {
      const request = route.request();
      const id = new URL(request.url()).pathname.split('/')[5];
      addedPasses.push({
        registrationId: id,
        body: request.postDataJSON(),
        csrf: request.headers()['x-csrf-token'] ?? null,
      });
      const answer = mocks.addPass?.(addedPasses.length) ?? { status: 500, json: {} };
      return fulfill(route, withSummary(id, answer));
    },
  );
  await page.route(
    (url) => api(url) && url.pathname === `/admin/events/${eventId}/activities`,
    (route) => fulfill(route, mocks.activities?.() ?? { json: [] }),
  );
  await page.route(
    (url) =>
      api(url) &&
      /^\/admin\/events\/[^/]+\/registrations\/[^/]+\/passes\/[^/]+\/selections$/.test(
        url.pathname,
      ),
    (route) => {
      const request = route.request();
      const segments = new URL(request.url()).pathname.split('/');
      selections.push({
        registrationId: segments[5],
        registrationPassId: segments[7],
        body: request.postDataJSON(),
        csrf: request.headers()['x-csrf-token'] ?? null,
      });
      const answer = mocks.selections?.(selections.length) ?? { status: 500, json: {} };
      return fulfill(route, withSummary(segments[5], answer));
    },
  );
  return { searches, creates, addedPasses, selections };
}
