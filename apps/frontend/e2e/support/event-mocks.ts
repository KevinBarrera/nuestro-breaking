import type { Page } from '@playwright/test';

// Mocked admin event lifecycle API (#213). Specs add their own routes for writes; Playwright
// runs the most recently added matching route first.
const api = (url: URL) => url.port === '3000';

export const activeEventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
export const otherEventId = 'b1b2c3d4-1234-4567-89ab-123456789abc';
export const archivedEventId = 'c1b2c3d4-1234-4567-89ab-123456789abc';

export type EventSummary = {
  id: string;
  name: string;
  slug: string;
  folioPrefix: string;
  archivedAt: string | null;
};

// A `GET /admin/events` row. The slug and prefix default from the name's first letters.
export const eventSummary = (
  id: string,
  name: string,
  overrides: Partial<EventSummary> = {},
): EventSummary => ({
  id,
  name,
  slug: name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, ''),
  folioPrefix: 'EV',
  archivedAt: null,
  ...overrides,
});

export const sampleEvents = [
  eventSummary(activeEventId, 'Los más pesados - Preliminares - Noviembre 2026', {
    slug: 'los-mas-pesados-nov-2026',
    folioPrefix: 'LMP',
  }),
  eventSummary(otherEventId, 'Nuestro Breaking Noviembre 2026'),
];

export const archivedEvent = eventSummary(archivedEventId, 'Batalla de primavera 2025', {
  folioPrefix: 'BP',
  archivedAt: '2026-06-01T12:00:00.000Z',
});

export const globalAdmin = {
  user: { id: 'admin', displayName: 'Kevin Barrera', roles: ['admin'], globalAdmin: true },
};
export const eventAdmin = {
  user: { id: 'event-admin', displayName: 'Ana', roles: ['admin'], globalAdmin: false },
};

export async function mockSession(page: Page, session: unknown = globalAdmin) {
  await page.route(
    (url) => api(url) && url.pathname === '/auth/session',
    (route) =>
      route.fulfill({
        json: session,
        headers: { 'X-CSRF-Token': 'csrf-token', 'Access-Control-Expose-Headers': 'X-CSRF-Token' },
      }),
  );
}

// Serves `events()` on `GET /admin/events`: archived rows only with `?archived=true`, as the
// backend does. Returns the queries the screen asked with.
export async function mockEventList(page: Page, events: () => EventSummary[]) {
  const queries: string[] = [];
  await page.route(
    (url) => api(url) && url.pathname === '/admin/events',
    (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const url = new URL(route.request().url());
      queries.push(url.search);
      const archived = url.searchParams.get('archived') === 'true';
      return route.fulfill({
        json: events().filter((event) => archived || event.archivedAt === null),
      });
    },
  );
  return queries;
}
