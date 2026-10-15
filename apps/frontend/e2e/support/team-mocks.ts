import type { Page } from '@playwright/test';
import { eventSummary } from './event-mocks.ts';

// Mocked team API for the Equipo screens (#214). Times are relative to the real clock,
// because the screen computes "Vence en …" from it.
const api = (url: URL) => url.port === '3000';
const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

export const selfId = '11111111-1111-4111-8111-111111111111';
export const coordinatorId = '22222222-2222-4222-8222-222222222222';
export const pendingId = '33333333-3333-4333-8333-333333333333';
export const expiredId = '44444444-4444-4444-8444-444444444444';
export const deactivatedId = '55555555-5555-4555-8555-555555555555';
export const noAccessId = '66666666-6666-4666-8666-666666666666';
export const firstEventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
export const secondEventId = 'b1b2c3d4-1234-4567-89ab-123456789abc';

export const teamEvents = [
  eventSummary(firstEventId, 'Los más pesados - Preliminares - Noviembre 2026'),
  eventSummary(secondEventId, 'Nuestro Breaking Noviembre 2026'),
];

export const teamMembers = () => [
  {
    id: selfId,
    displayName: 'Kevin Barrera',
    email: 'kevin@example.org',
    status: 'active',
    access: { kind: 'global' },
    invitation: null,
  },
  {
    id: coordinatorId,
    displayName: 'Coordinación principal',
    email: 'coordinacion@example.org',
    status: 'active',
    access: { kind: 'global' },
    invitation: null,
  },
  {
    id: pendingId,
    displayName: 'Persona de entrada con un nombre largo para pantallas angostas',
    email: 'persona.de.entrada.con.correo.largo@example.org',
    status: 'pending',
    access: { kind: 'events', events: [teamEvents[0]] },
    invitation: { expiresAt: inHours(50), expired: false },
  },
  {
    id: expiredId,
    displayName: 'Persona con enlace vencido',
    email: 'vencido@example.org',
    status: 'pending',
    access: { kind: 'events', events: teamEvents },
    invitation: { expiresAt: inHours(-5), expired: true },
  },
  {
    id: deactivatedId,
    displayName: 'Persona de caja',
    email: 'caja@example.org',
    status: 'deactivated',
    access: { kind: 'events', events: [teamEvents[1]] },
    invitation: null,
  },
];

// A member whose only event was deleted (#213 D9). Not in the default list, so the specs that
// count rows stay as they are; pass it to `mockTeamApi` to show it.
export const noAccessMember = {
  id: noAccessId,
  displayName: 'Persona sin acceso',
  email: 'sin.acceso@example.org',
  status: 'no_access',
  access: { kind: 'none' },
  invitation: null,
};

export const globalAdminSession = {
  user: { id: selfId, displayName: 'Kevin Barrera', roles: ['admin'], globalAdmin: true },
};

// Session, events and team list. Specs add their own routes for mutations; Playwright runs
// the most recently added matching route first.
export async function mockTeamApi(
  page: Page,
  session: unknown = globalAdminSession,
  members: () => unknown[] = teamMembers,
) {
  await page.route(
    (url) => api(url) && url.pathname === '/auth/session',
    (route) =>
      route.fulfill({
        json: session,
        headers: { 'X-CSRF-Token': 'csrf-token', 'Access-Control-Expose-Headers': 'X-CSRF-Token' },
      }),
  );
  await page.route(
    (url) => api(url) && url.pathname === '/admin/events',
    (route) => route.fulfill({ json: teamEvents }),
  );
  await page.route(
    (url) => api(url) && url.pathname === '/admin/team',
    (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ json: { members: members() } })
        : route.fallback(),
  );
}
