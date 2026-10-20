import type { Page } from '@playwright/test';
import { activeEventId, eventSummary, mockSession } from './event-mocks.ts';

// Mocked admin registration API (#105): search, entitlements and the manual registration.
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

type Answer = { status?: number; json?: unknown; abort?: boolean };

export type RegistrationMocks = {
  search?: (url: URL) => Answer;
  entitlements?: (id: string) => Answer;
  // `attempt` counts the POSTs, starting at 1.
  create?: (attempt: number) => Answer;
};

export type SentCreate = { body: Record<string, unknown>; csrf: string | null };

export async function mockRegistrations(page: Page, mocks: RegistrationMocks = {}) {
  const searches: URL[] = [];
  const creates: SentCreate[] = [];
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
      return fulfill(
        route,
        mocks.entitlements?.(id) ?? { json: { passes: [], accessibleActivityIds: [] } },
      );
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
  return { searches, creates };
}
