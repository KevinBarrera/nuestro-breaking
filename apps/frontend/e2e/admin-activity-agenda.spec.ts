import { expect, test, type Page } from '@playwright/test';

const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const mainVenueId = 'e1b2c3d4-1234-4567-89ab-123456789abc';
const studioId = 'e2b2c3d4-1234-4567-89ab-123456789abc';
const activitiesPath = `/admin/events/${eventId}/activities`;
const api = (url: URL) => url.port === '3000';

// The browser runs in Tokyo while the event is in Mexico City, so any grouping or time that
// used the browser time zone would land on a different day or hour.
test.use({ timezoneId: 'Asia/Tokyo' });

const foundation = {
  event: {
    id: eventId,
    name: 'Encuentro del barrio',
    timeZone: 'America/Mexico_City',
    startsAt: '2026-11-21T15:00:00.000Z',
    endsAt: '2026-11-23T05:00:00.000Z',
    windowStatus: 'bounded',
  },
  venues: [
    { id: mainVenueId, name: 'Centro cultural' },
    { id: studioId, name: 'Estudio principal' },
  ],
  activities: [],
  deferredFields: [],
};

type Activity = {
  id: string;
  kind: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status?: 'active' | 'archived';
  venueId?: string;
};

const row = ({ status = 'active', venueId = mainVenueId, ...rest }: Activity) => ({
  eventId,
  venueId,
  status,
  version: 1,
  ...rest,
});

// Mexico City is UTC-6 in November. The API order is deliberately not chronological.
const activities = [
  row({
    id: 'd1b2c3d4-1234-4567-89ab-123456789abc',
    kind: 'battle',
    name: 'Batalla de crews',
    startsAt: '2026-11-21T22:00:00.000Z', // Saturday 16:00 local
    endsAt: '2026-11-22T00:00:00.000Z',
  }),
  row({
    // UTC (and Tokyo) say Sunday 22; the event's own clock says Saturday 21 at 22:30.
    id: 'd2b2c3d4-1234-4567-89ab-123456789abc',
    kind: 'social',
    name: 'Cypher nocturno',
    startsAt: '2026-11-22T04:30:00.000Z',
    endsAt: '2026-11-22T06:00:00.000Z',
    venueId: studioId,
  }),
  row({
    id: 'd3b2c3d4-1234-4567-89ab-123456789abc',
    kind: 'competition',
    name: 'Bgirl 1v1',
    startsAt: '2026-11-21T16:00:00.000Z', // Saturday 10:00 local
    endsAt: '2026-11-21T18:00:00.000Z',
  }),
  row({
    id: 'd4b2c3d4-1234-4567-89ab-123456789abc',
    kind: 'battle',
    name: 'Exhibición final',
    startsAt: '2026-11-22T20:00:00.000Z', // Sunday 14:00 local
    endsAt: '2026-11-22T21:00:00.000Z',
  }),
  row({
    id: 'd5b2c3d4-1234-4567-89ab-123456789abc',
    kind: 'social',
    name: 'Cypher cancelado',
    startsAt: '2026-11-22T18:00:00.000Z', // Sunday 12:00 local
    endsAt: '2026-11-22T19:00:00.000Z',
    status: 'archived',
  }),
];

async function mockCatalog(page: Page, rows: unknown[] = activities) {
  await page.route(
    (url) => api(url) && url.pathname === '/auth/session',
    (route) =>
      route.fulfill({
        headers: { 'X-CSRF-Token': 'safe-token', 'Access-Control-Expose-Headers': 'X-CSRF-Token' },
        json: { user: { id: 'admin', roles: ['admin'] } },
      }),
  );
  await page.route(
    (url) => api(url) && url.pathname === `/admin/events/${eventId}/foundation`,
    (route) => route.fulfill({ json: foundation }),
  );
  await page.route(
    (url) => api(url) && url.pathname === activitiesPath,
    (route) => route.fulfill({ json: rows }),
  );
}

const day = (page: Page, label: string) => page.getByRole('region', { name: label });
const rowNames = (page: Page, label: string) => day(page, label).getByRole('heading', { level: 3 });
const kinds = (page: Page) => page.getByRole('group', { name: 'Filtrar por tipo' });

// Grouping, ordering, counts, search normalization and time ranges are covered by
// `activity-agenda-model.test.ts`; this checks that the screen renders them and wires the
// kind chips, the search box and the archived toggle together.
test('renders the agenda on the event clock and wires its filters', async ({ page }) => {
  await mockCatalog(page);
  await page.goto(activitiesPath);

  await expect(page.getByText('Agenda en hora del evento: America/Mexico_City')).toBeVisible();
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText([
    /Sábado 21 de noviembre/,
    /Domingo 22 de noviembre/,
  ]);
  await expect(rowNames(page, 'Sábado 21 de noviembre')).toHaveText([
    'Bgirl 1v1',
    'Batalla de crews',
    'Cypher nocturno',
  ]);
  const nightly = page.getByRole('listitem').filter({ hasText: 'Cypher nocturno' });
  await expect(nightly).toContainText('22:30–00:00 (+1 día)');
  await expect(nightly).toContainText('Social');
  await expect(nightly).toContainText('Estudio principal');
  await expect(nightly).toContainText('Activa');

  await expect(kinds(page).getByRole('button')).toHaveText([
    'Todas · 4',
    'Batalla · 2',
    'Competencia · 1',
    'Social · 1',
    'Taller · 0',
  ]);
  await expect(kinds(page).getByRole('button', { name: /^Todas/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await kinds(page)
    .getByRole('button', { name: /^Batalla/ })
    .click();
  await expect(kinds(page).getByRole('button', { name: /^Batalla/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(kinds(page).getByRole('button', { name: /^Todas/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.getByRole('main').getByRole('heading', { level: 3 })).toHaveText([
    'Batalla de crews',
    'Exhibición final',
  ]);

  const search = page.getByRole('searchbox', { name: 'Buscar actividad' });
  await search.fill('EXHIBICION');
  await expect(page.getByRole('main').getByRole('heading', { level: 3 })).toHaveText([
    'Exhibición final',
  ]);
  await expect(day(page, 'Sábado 21 de noviembre')).toHaveCount(0);
  await search.fill('no existe');
  await expect(page.getByText('Ninguna actividad coincide con los filtros.')).toBeVisible();
  await search.fill('');
  await kinds(page)
    .getByRole('button', { name: /^Todas/ })
    .click();

  const toggle = page.getByRole('checkbox', { name: 'Mostrar archivadas' });
  await expect(toggle).not.toBeChecked();
  await expect(page.getByText('Cypher cancelado')).toHaveCount(0);
  await toggle.check();
  const archived = page.getByRole('listitem').filter({ hasText: 'Cypher cancelado' });
  await expect(archived).toContainText('Archivada');
  await expect(archived.getByRole('button', { name: 'Editar' })).toHaveCount(0);
  await expect(archived.getByRole('button', { name: 'Restaurar Cypher cancelado' })).toBeVisible();
  await expect(kinds(page).getByRole('button', { name: /^Social/ })).toHaveText('Social · 2');
  await toggle.uncheck();
  await expect(page.getByText('Cypher cancelado')).toHaveCount(0);
});

test('explains that workshops are announced later when the workshop filter is empty', async ({
  page,
}) => {
  await mockCatalog(page);
  await page.goto(activitiesPath);

  await kinds(page)
    .getByRole('button', { name: /^Taller/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Aún no hay talleres' })).toBeVisible();
  await expect(page.getByText('Se anuncian más adelante.')).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Agenda de actividades' }).getByRole('listitem'),
  ).toHaveCount(0);
});

test('shows an empty agenda when the event has no activities', async ({ page }) => {
  await mockCatalog(page, []);
  await page.goto(activitiesPath);

  await expect(page.getByText('Aún no hay actividades para este evento.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nueva actividad' })).toBeVisible();
});

test('opens the create and edit forms from the agenda', async ({ page }) => {
  await mockCatalog(page);
  await page.goto(activitiesPath);

  await page.getByRole('button', { name: 'Nueva actividad' }).click();
  await expect(page.getByRole('form', { name: 'Nueva actividad' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();

  await page
    .getByRole('listitem')
    .filter({ hasText: 'Cypher nocturno' })
    .getByRole('button', { name: 'Editar' })
    .click();
  const form = page.getByRole('form', { name: 'Editar actividad' });
  await expect(form.getByLabel('Inicio')).toHaveValue('2026-11-21T22:30');
  await expect(form.getByLabel('Nombre')).toHaveValue('Cypher nocturno');
});

test('fits a 375px screen without horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await mockCatalog(page);
  await page.goto(activitiesPath);
  await page.getByRole('checkbox', { name: 'Mostrar archivadas' }).check();
  await expect(page.getByText('Cypher cancelado')).toBeVisible();

  const scrollWidth = await page.evaluate(
    () =>
      (globalThis as unknown as { document: { documentElement: { scrollWidth: number } } }).document
        .documentElement.scrollWidth,
  );
  expect(scrollWidth).toBeLessThanOrEqual(375);
  const edit = page
    .getByRole('listitem')
    .filter({ hasText: 'Batalla de crews' })
    .getByRole('button', { name: 'Editar' });
  const box = await edit.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
});

const pressed = (page: Page) => kinds(page).locator('button[aria-pressed="true"]');

test('keeps the selected kind chip after archiving its last active activity', async ({ page }) => {
  let rows = activities;
  await mockCatalog(page);
  await page.route(
    (url) => api(url) && url.pathname === activitiesPath,
    (route) => route.fulfill({ json: rows }),
  );
  await page.route(
    (url) => api(url) && url.pathname.endsWith('/archive'),
    (route) => {
      rows = rows.map((entry) =>
        entry.name === 'Bgirl 1v1' ? { ...entry, status: 'archived', version: 2 } : entry,
      );
      return route.fulfill({ json: rows.find((entry) => entry.name === 'Bgirl 1v1') });
    },
  );
  await page.goto(activitiesPath);

  await kinds(page)
    .getByRole('button', { name: /^Competencia/ })
    .click();
  const bgirl = page.getByRole('listitem').filter({ hasText: 'Bgirl 1v1' });
  await bgirl.getByRole('button', { name: 'Archivar' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Archivar' }).click();
  await expect(page.getByRole('status')).toContainText('Actividad archivada');

  await expect(pressed(page)).toHaveText('Competencia · 0');
  await expect(page.getByText('Ninguna actividad coincide con los filtros.')).toBeVisible();
  await kinds(page)
    .getByRole('button', { name: /^Todas/ })
    .click();
  await expect(pressed(page)).toHaveText('Todas · 3');
  await expect(kinds(page).getByRole('button', { name: /^Competencia/ })).toHaveCount(0);
});

test('keeps the selected kind chip when hiding archived activities', async ({ page }) => {
  await mockCatalog(
    page,
    activities.map((entry) =>
      entry.name === 'Bgirl 1v1' ? { ...entry, status: 'archived' } : entry,
    ),
  );
  await page.goto(activitiesPath);

  const toggle = page.getByRole('checkbox', { name: 'Mostrar archivadas' });
  await expect(kinds(page).getByRole('button', { name: /^Competencia/ })).toHaveCount(0);
  await toggle.check();
  await kinds(page)
    .getByRole('button', { name: /^Competencia/ })
    .click();
  await expect(pressed(page)).toHaveText('Competencia · 1');

  await toggle.uncheck();
  await expect(pressed(page)).toHaveText('Competencia · 0');
  await expect(page.getByText('Ninguna actividad coincide con los filtros.')).toBeVisible();
  await toggle.check();
  await expect(page.getByRole('main').getByRole('heading', { level: 3 })).toHaveText(['Bgirl 1v1']);
});
