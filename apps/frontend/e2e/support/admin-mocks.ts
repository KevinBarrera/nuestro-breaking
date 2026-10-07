import type { Page } from '@playwright/test';

// Shared mocked admin API for specs that sweep every admin screen (contrast, targets, phone
// width). Screen-specific behavior stays in each screen's own spec.
export const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const venueId = 'e1b2c3d4-1234-4567-89ab-123456789abc';
const battleId = 'd1b2c3d4-1234-4567-89ab-123456789abc';
const workshopId = 'd2b2c3d4-1234-4567-89ab-123456789abc';
const api = (url: URL) => url.port === '3000';

export const adminScreens = [
  { name: 'Resumen', path: `/admin/events/${eventId}` },
  { name: 'Check-in', path: `/admin/events/${eventId}/check-in` },
  { name: 'Actividades', path: `/admin/events/${eventId}/activities` },
  { name: 'Pases', path: `/admin/events/${eventId}/pass-types` },
] as const;

export const themes = ['light', 'dark'] as const;

const activity = (id: string, kind: string, name: string, startsAt: string, endsAt: string) => ({
  id,
  eventId,
  venueId,
  kind,
  name,
  startsAt,
  endsAt,
  status: 'active',
  version: 1,
});

const activities = [
  activity(
    battleId,
    'battle',
    'Batalla de crews con nombre largo para pantallas angostas',
    '2026-11-21T22:00:00.000Z',
    '2026-11-22T00:00:00.000Z',
  ),
  activity(
    workshopId,
    'workshop',
    'Taller de footwork',
    '2026-11-21T16:00:00.000Z',
    '2026-11-21T18:00:00.000Z',
  ),
];

const passTypes = [
  {
    id: 'f1b2c3d4-1234-4567-89ab-123456789abc',
    eventId,
    name: 'Pase completo',
    passClass: 'full',
    priceCents: 150000,
    requiresPassClass: null,
    status: 'active',
    version: 1,
    activities: [
      { activityId: battleId, access: 'selectable' },
      { activityId: workshopId, access: 'included' },
    ],
  },
  {
    id: 'f2b2c3d4-1234-4567-89ab-123456789abc',
    eventId,
    name: 'Entrada general',
    passClass: 'general',
    priceCents: 30000,
    requiresPassClass: null,
    status: 'active',
    version: 1,
    activities: [],
  },
];

const foundation = {
  event: {
    id: eventId,
    name: 'Encuentro del barrio',
    timeZone: 'America/Mexico_City',
    startsAt: '2026-11-21T15:00:00.000Z',
    endsAt: '2026-11-23T05:00:00.000Z',
    windowStatus: 'bounded',
  },
  venues: [{ id: venueId, name: 'Centro cultural' }],
  activities: [],
  deferredFields: [],
};

const registration = {
  participant: {
    id: 'person',
    fullName: 'Luz Rivera',
    email: 'luz@example.org',
    stageName: 'Luz',
  },
  registration: {
    id: 'c1b2c3d4-1234-4567-89ab-123456789abc',
    eventId,
    folio: 'NB-42',
    status: 'confirmed',
    checkedInAt: null,
  },
  activities: [{ id: battleId, name: 'Batalla de crews', kind: 'battle', checkedInAt: null }],
};

export async function mockAdminApi(page: Page) {
  const routes: [(url: URL) => boolean, unknown][] = [
    [(url) => url.pathname === '/auth/session', { user: { id: 'admin', roles: ['admin'] } }],
    [(url) => url.pathname === '/admin/events', [{ id: eventId, name: 'Encuentro del barrio' }]],
    [(url) => url.pathname.endsWith('/foundation'), foundation],
    [(url) => url.pathname.endsWith('/activities'), activities],
    [(url) => url.pathname.endsWith('/pass-types'), passTypes],
    [
      (url) => url.pathname.endsWith('/participants'),
      { total: 1, limit: 20, offset: 0, results: [registration] },
    ],
  ];
  for (const [matches, json] of routes)
    await page.route(
      (url) => api(url) && matches(url),
      (route) => route.fulfill({ json }),
    );
}

export async function useTheme(page: Page, theme: (typeof themes)[number]) {
  await page.addInitScript({ content: `localStorage.setItem('nb-theme', '${theme}');` });
}

// Puts each screen in a state that shows its main interactive controls.
export async function revealControls(page: Page, name: (typeof adminScreens)[number]['name']) {
  if (name === 'Check-in') {
    await page.getByRole('textbox', { name: 'Buscar inscripción' }).fill('Luz');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.getByRole('button', { name: /Luz Rivera/ }).click();
    await page.getByRole('button', { name: 'Registrar entrada al evento' }).waitFor();
  }
  if (name === 'Pases') {
    await page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: 'Pase completo' }) })
      .getByRole('button', { name: 'Editar', exact: true })
      .click();
    await page
      .getByRole('region', { name: 'Mapa de acceso' })
      .getByRole('combobox')
      .first()
      .waitFor();
  }
  if (name === 'Actividades') await page.getByRole('button', { name: /^Todas/ }).waitFor();
  if (name === 'Resumen') await page.getByRole('table', { name: 'Pases a la venta' }).waitFor();
}
