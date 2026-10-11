import type { Page, Request } from '@playwright/test';

// Mocked public activation API (#214) for the Activa tu cuenta page.
export const activationToken = 'c0ffee'.repeat(10) + 'c0ff';
export const activationDetails = {
  displayName: 'Persona de entrada',
  email: 'staff1@example.org',
  expiresAt: '2026-10-15T00:20:00.000Z',
};

type Reply = { status: number; json: unknown };

export async function mockActivation(
  page: Page,
  check: Reply = { status: 200, json: activationDetails },
  activate: Reply = { status: 200, json: { activated: true } },
) {
  const requests: { check: Request[]; activate: Request[] } = { check: [], activate: [] };
  await page.route(
    (url) => url.port === '3000' && url.pathname === '/auth/activation/check',
    (route) => {
      requests.check.push(route.request());
      return route.fulfill(check);
    },
  );
  await page.route(
    (url) => url.port === '3000' && url.pathname === '/auth/activation',
    (route) => {
      requests.activate.push(route.request());
      return route.fulfill(activate);
    },
  );
  return requests;
}
