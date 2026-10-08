import type { Locator, Page } from '@playwright/test';

// Shared mocked admin API for specs that sweep every admin screen (contrast, targets, phone
// width). Screen-specific behavior stays in each screen's own spec.
export const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const venueId = 'e1b2c3d4-1234-4567-89ab-123456789abc';
const battleId = 'd1b2c3d4-1234-4567-89ab-123456789abc';
const workshopId = 'd2b2c3d4-1234-4567-89ab-123456789abc';
const cypherId = 'd3b2c3d4-1234-4567-89ab-123456789abc';
const fullPassId = 'f1b2c3d4-1234-4567-89ab-123456789abc';
const api = (url: URL) => url.port === '3000';

export const adminScreens = [
  { name: 'Resumen', path: `/admin/events/${eventId}` },
  { name: 'Check-in', path: `/admin/events/${eventId}/check-in` },
  { name: 'Actividades', path: `/admin/events/${eventId}/activities` },
  { name: 'Pases', path: `/admin/events/${eventId}/passes` },
  { name: 'Pase', path: `/admin/events/${eventId}/passes/${fullPassId}` },
  { name: 'Nuevo pase', path: `/admin/events/${eventId}/passes/new` },
] as const;

export type AdminScreenName = (typeof adminScreens)[number]['name'];
export const adminScreen = (name: AdminScreenName) =>
  adminScreens.find((screen) => screen.name === name)!;

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
  // Hidden until "Mostrar archivadas"; it opens the restore confirmation.
  {
    ...activity(
      cypherId,
      'social',
      'Cypher archivado con nombre largo para pantallas angostas',
      '2026-11-22T01:00:00.000Z',
      '2026-11-22T02:00:00.000Z',
    ),
    status: 'archived',
    version: 2,
  },
];

const passTypes = [
  {
    id: fullPassId,
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
  // Listed under "Archivados" on the pass list; it opens the pass restore confirmation.
  {
    id: 'f3b2c3d4-1234-4567-89ab-123456789abc',
    eventId,
    name: 'Pase archivado con nombre largo para pantallas angostas',
    passClass: 'general',
    priceCents: 20000,
    requiresPassClass: null,
    status: 'archived',
    version: 3,
    activities: [{ activityId: workshopId, access: 'included' }],
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

// Open with both dates set, so the overview shows the status detail and both "Quitar" buttons.
const sales = {
  slug: 'encuentro-del-barrio-con-nombre-largo-para-pantallas-angostas',
  salesEnabled: true,
  salesOpensAt: '2026-10-01T15:00:00.000Z',
  salesClosesAt: '2026-11-20T06:00:00.000Z',
  state: 'open',
  reason: null,
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
    [(url) => url.pathname.endsWith('/sales'), sales],
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

const accessTriggers = (page: Page) =>
  page
    .getByRole('region', { name: 'Acceso a actividades' })
    .locator('button[aria-haspopup="listbox"]');

// Puts each screen in a state that shows its main interactive controls.
export async function revealControls(page: Page, name: AdminScreenName) {
  if (name === 'Check-in') {
    await page.getByRole('textbox', { name: 'Buscar inscripción' }).fill('Luz');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.getByRole('button', { name: /Luz Rivera/ }).click();
    await page.getByRole('button', { name: 'Registrar entrada al evento' }).waitFor();
  }
  // The list holds cards: links to each pass's own screen and "Restaurar" on archived ones.
  if (name === 'Pases') {
    await page.getByRole('link', { name: 'Editar Pase completo' }).waitFor();
    await page.getByRole('button', { name: /^Restaurar Pase archivado/ }).waitFor();
  }
  if (name === 'Pase' || name === 'Nuevo pase') await accessTriggers(page).first().waitFor();
  if (name === 'Actividades') await page.getByRole('button', { name: /^Todas/ }).waitFor();
  if (name === 'Resumen') {
    await page.getByRole('table', { name: 'Pases a la venta' }).waitFor();
    await page.getByRole('button', { name: 'Quitar fecha de cierre' }).waitFor();
  }
}

// The catalog dialogs, each opened from its screen (after `revealControls`) without writing:
// the activity form modal, "Revisar cambios", the destructive archive confirmation, the
// activity and pass restore confirmations and the unsaved-changes warning. `open` returns the open dialog.
export const adminDialogs: {
  name: string;
  screen: AdminScreenName;
  open: (page: Page) => Promise<Locator>;
}[] = [
  {
    name: 'activity form',
    screen: 'Actividades',
    open: async (page) => {
      await page.getByRole('button', { name: 'Nueva actividad' }).click();
      return page.getByRole('dialog', { name: 'Nueva actividad' });
    },
  },
  {
    name: 'review changes',
    screen: 'Pase',
    open: async (page) => {
      const form = page.getByRole('form', { name: 'Editar pase' });
      await form
        .getByLabel('Nombre')
        .fill('Pase completo con nombre largo para pantallas angostas');
      await form.getByRole('button', { name: 'Guardar cambios' }).click();
      return page.getByRole('dialog', { name: 'Revisar cambios' });
    },
  },
  {
    name: 'archive confirmation',
    screen: 'Pase',
    open: async (page) => {
      await page
        .getByRole('form', { name: 'Editar pase' })
        .getByRole('button', { name: 'Archivar' })
        .click();
      return page.getByRole('alertdialog', { name: '¿Archivar Pase completo?' });
    },
  },
  {
    name: 'activity restore confirmation',
    screen: 'Actividades',
    open: async (page) => {
      await page.getByRole('checkbox', { name: 'Mostrar archivadas' }).check();
      await page.getByRole('button', { name: /^Restaurar Cypher archivado/ }).click();
      return page.getByRole('alertdialog', { name: /^¿Restaurar Cypher archivado/ });
    },
  },
  {
    name: 'pass restore confirmation',
    screen: 'Pases',
    open: async (page) => {
      await page.getByRole('button', { name: /^Restaurar Pase archivado/ }).click();
      return page.getByRole('alertdialog', { name: /^¿Restaurar Pase archivado/ });
    },
  },
  {
    name: 'unsaved changes warning',
    screen: 'Pase',
    open: async (page) => {
      await page.getByRole('form', { name: 'Editar pase' }).getByLabel('Nombre').fill('Pase VIP');
      await page
        .getByRole('navigation', { name: 'Ruta de navegación' })
        .getByRole('link', { name: 'Pases' })
        .click();
      return page.getByRole('alertdialog', { name: '¿Salir sin guardar?' });
    },
  },
];
