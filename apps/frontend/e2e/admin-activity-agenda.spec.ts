import { expect, test, type Page } from '@playwright/test';

const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const mainVenueId = 'e1b2c3d4-1234-4567-89ab-123456789abc';
const studioId = 'e2b2c3d4-1234-4567-89ab-123456789abc';
const activitiesPath = `/admin/events/${eventId}/activities`;
const api = (url: URL) => url.port === '3000';
const listsPath = `/admin/events/${eventId}/attendee-lists`;

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

const activityRow = ({ status = 'active', venueId = mainVenueId, ...rest }: Activity) => ({
  eventId,
  venueId,
  status,
  version: 1,
  ...rest,
});

// Mexico City is UTC-6 in November. The API order is deliberately not chronological.
const activities = [
  activityRow({
    id: 'd1b2c3d4-1234-4567-89ab-123456789abc',
    kind: 'competition',
    name: 'Batalla de crews',
    startsAt: '2026-11-21T22:00:00.000Z', // Saturday 16:00 local
    endsAt: '2026-11-22T00:00:00.000Z',
  }),
  activityRow({
    // UTC (and Tokyo) say Sunday 22; the event's own clock says Saturday 21 at 22:30.
    id: 'd2b2c3d4-1234-4567-89ab-123456789abc',
    kind: 'social',
    name: 'Cypher nocturno',
    startsAt: '2026-11-22T04:30:00.000Z',
    endsAt: '2026-11-22T06:00:00.000Z',
    venueId: studioId,
  }),
  activityRow({
    id: 'd3b2c3d4-1234-4567-89ab-123456789abc',
    kind: 'competition',
    name: 'Bgirl 1v1',
    startsAt: '2026-11-21T16:00:00.000Z', // Saturday 10:00 local
    endsAt: '2026-11-21T18:00:00.000Z',
  }),
  activityRow({
    id: 'd4b2c3d4-1234-4567-89ab-123456789abc',
    kind: 'competition',
    name: 'Exhibición final',
    startsAt: '2026-11-22T20:00:00.000Z', // Sunday 14:00 local
    endsAt: '2026-11-22T21:00:00.000Z',
  }),
  activityRow({
    id: 'd5b2c3d4-1234-4567-89ab-123456789abc',
    kind: 'social',
    name: 'Cypher cancelado',
    startsAt: '2026-11-22T18:00:00.000Z', // Sunday 12:00 local
    endsAt: '2026-11-22T19:00:00.000Z',
    status: 'archived',
  }),
];

// Bgirl 1v1 has two inscritos and Batalla de crews one; Exhibición final is a competition nobody
// has access to, so the snapshot leaves it out. Social activities are never in the snapshot.
const attendeeLists = {
  event: { id: eventId, name: 'Encuentro del barrio' },
  generatedAt: '2026-11-20T12:00:00.000Z',
  passTypes: [],
  activities: [
    {
      id: activities[0].id,
      name: 'Batalla de crews',
      kind: 'competition',
      startsAt: activities[0].startsAt,
    },
    {
      id: activities[2].id,
      name: 'Bgirl 1v1',
      kind: 'competition',
      startsAt: activities[2].startsAt,
    },
  ],
  registrations: ['r1', 'r2'].map((id, index) => ({
    registrationId: id,
    folio: null,
    fullName: `Persona ${index + 1}`,
    stageName: null,
    status: 'confirmed',
    eventCheckedInAt: null,
    passTypeIds: [],
    activities: (index === 0 ? [activities[0].id, activities[2].id] : [activities[2].id]).map(
      (activityId) => ({ activityId, checkedInAt: null }),
    ),
  })),
};

async function mockCatalog(
  page: Page,
  rows: unknown[] = activities,
  lists: unknown = attendeeLists,
) {
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
  await page.route(
    (url) => api(url) && url.pathname === listsPath,
    (route) => (lists ? route.fulfill({ json: lists }) : route.fulfill({ status: 500, json: {} })),
  );
}

const day = (page: Page, label: string) => page.getByRole('region', { name: label });
const rowNames = (page: Page) => page.getByRole('main').getByRole('heading', { level: 3 });
const kinds = (page: Page) => page.getByRole('group', { name: 'Filtrar por tipo' });
const tab = (page: Page, name: RegExp) => page.getByRole('tab', { name });
const row = (page: Page, name: string) =>
  page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { level: 3, name, exact: true }) });

// Grouping, ordering, counts, overlap and search normalization are covered by
// `activity-agenda-model.test.ts`; this checks that the screen renders them and wires the tabs,
// the kind chips and the search box together.
test('renders the agenda on the event clock and wires its filters', async ({ page }) => {
  await mockCatalog(page);
  await page.goto(activitiesPath);

  await expect(
    page.getByText('La agenda del evento: competencias, talleres y sociales.'),
  ).toBeVisible();
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText([
    'Sábado 21 de noviembre',
    'Domingo 22 de noviembre',
  ]);
  await expect(day(page, 'Sábado 21 de noviembre')).toContainText('3 actividades');
  await expect(day(page, 'Domingo 22 de noviembre')).toContainText('1 actividad');
  await expect(day(page, 'Sábado 21 de noviembre').getByRole('heading', { level: 3 })).toHaveText([
    'Bgirl 1v1',
    'Batalla de crews',
    'Cypher nocturno',
  ]);
  const nightly = row(page, 'Cypher nocturno');
  await expect(nightly).toContainText('22:30–00:00 (+1 día)');
  await expect(nightly).toContainText('Social · Estudio principal');
  await expect(nightly).not.toContainText('Activa');
  await expect(
    page.getByText('Horas de Ciudad de México. El evento va del 21 al 22 de noviembre de 2026.'),
  ).toBeVisible();

  await expect(tab(page, /^Activas/)).toHaveText('Activas 4');
  await expect(tab(page, /^Activas/)).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, /^Archivadas/)).toHaveText('Archivadas 1');
  await expect(kinds(page).getByRole('button')).toHaveText([
    'Todas 4',
    'Competencias 3',
    'Sociales 1',
  ]);
  await expect(kinds(page).getByRole('button', { name: /^Todas/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await kinds(page)
    .getByRole('button', { name: /^Competencias/ })
    .click();
  await expect(kinds(page).getByRole('button', { name: /^Competencias/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(rowNames(page)).toHaveText(['Bgirl 1v1', 'Batalla de crews', 'Exhibición final']);

  const search = page.getByRole('searchbox', { name: 'Buscar actividad' });
  await search.fill('EXHIBICION');
  await expect(rowNames(page)).toHaveText(['Exhibición final']);
  await search.fill('no existe');
  await expect(page.getByText('Ninguna actividad coincide con “no existe”')).toBeVisible();
  await expect(page.getByText('Revisa cómo se escribe o quita el filtro de tipo.')).toBeVisible();
});

test('shows archived activities only under Archivadas, each with "Restaurar"', async ({ page }) => {
  await mockCatalog(page);
  await page.goto(activitiesPath);
  await kinds(page)
    .getByRole('button', { name: /^Competencias/ })
    .click();
  await expect(page.getByText('Cypher cancelado')).toHaveCount(0);

  // Arrow keys move between the tabs; changing tab resets the chip to Todas.
  await tab(page, /^Activas/).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, /^Archivadas/)).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, /^Archivadas/)).toBeFocused();
  await expect(kinds(page).getByRole('button')).toHaveText(['Todas 1', 'Sociales 1']);
  await expect(rowNames(page)).toHaveText(['Cypher cancelado']);
  const archived = row(page, 'Cypher cancelado');
  await expect(archived.getByRole('button')).toHaveText(['Restaurar']);
  await expect(archived.getByRole('button', { name: 'Restaurar Cypher cancelado' })).toBeVisible();
  await expect(archived).not.toContainText('inscrit');
});

test('shows inscritos from the attendee lists and flags overlapping times', async ({ page }) => {
  const overlap = activityRow({
    id: 'd6b2c3d4-1234-4567-89ab-123456789abc',
    kind: 'competition',
    name: 'Locking 1v1',
    startsAt: '2026-11-21T17:00:00.000Z', // Saturday 11:00 local, during Bgirl 1v1
    endsAt: '2026-11-21T19:00:00.000Z',
  });
  await mockCatalog(page, [...activities, overlap]);
  await page.goto(activitiesPath);

  await expect(row(page, 'Bgirl 1v1')).toContainText('2 inscritos');
  await expect(row(page, 'Batalla de crews')).toContainText('1 inscrito');
  // A competition missing from the snapshot has nobody; a social activity has no count.
  await expect(row(page, 'Exhibición final')).toContainText('Sin inscritos');
  await expect(row(page, 'Cypher nocturno')).not.toContainText('inscrit');

  await expect(row(page, 'Bgirl 1v1')).toContainText('Mismo horario que Locking 1v1');
  await expect(row(page, 'Locking 1v1')).toContainText('Mismo horario que Bgirl 1v1');
  // Back to back in the same venue is not an overlap.
  await expect(row(page, 'Batalla de crews')).not.toContainText('Mismo horario');
});

test('hides the inscritos when the attendee lists cannot be read', async ({ page }) => {
  await mockCatalog(page, activities, null);
  await page.goto(activitiesPath);

  await expect(rowNames(page)).toHaveText([
    'Bgirl 1v1',
    'Batalla de crews',
    'Cypher nocturno',
    'Exhibición final',
  ]);
  await expect(page.getByRole('main')).not.toContainText('inscrit');
});

test('starts an event without activities from its empty state', async ({ page }) => {
  await mockCatalog(page, []);
  await page.goto(activitiesPath);

  await expect(page.getByRole('heading', { name: 'Aún no hay actividades' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Tipos de actividad' })).toContainText(
    'Fiestas, cyphers abiertos y convivencias.',
  );
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Agregar la primera actividad' }).click();
  await expect(page.getByRole('dialog', { name: 'Nueva actividad' })).toBeVisible();
});

test('says when no activity is archived', async ({ page }) => {
  await mockCatalog(
    page,
    activities.filter((entry) => entry.status === 'active'),
  );
  await page.goto(activitiesPath);
  await tab(page, /^Archivadas/).click();

  await expect(page.getByText('No hay actividades archivadas')).toBeVisible();
  await expect(
    page.getByText('Cuando archives una actividad aparecerá aquí y podrás restaurarla.'),
  ).toBeVisible();
});

test('opens the create and edit forms from the agenda', async ({ page }) => {
  await mockCatalog(page);
  await page.goto(activitiesPath);

  await page.getByRole('button', { name: 'Nueva actividad' }).click();
  await expect(page.getByRole('form', { name: 'Nueva actividad' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();

  await page.getByRole('button', { name: 'Editar Cypher nocturno' }).click();
  const form = page.getByRole('form', { name: 'Editar actividad' });
  await expect(form.getByLabel('Nombre')).toHaveValue('Cypher nocturno');
});

test('fits a 375px screen without horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await mockCatalog(page);
  await page.goto(activitiesPath);
  await expect(page.getByText('Batalla de crews')).toBeVisible();

  const scrollWidth = await page.evaluate(
    () =>
      (globalThis as unknown as { document: { documentElement: { scrollWidth: number } } }).document
        .documentElement.scrollWidth,
  );
  expect(scrollWidth).toBeLessThanOrEqual(375);
  for (const name of ['Editar Batalla de crews', 'Archivar Batalla de crews']) {
    const box = await page.getByRole('button', { name }).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  // The inscritos column hides at this width.
  await expect(row(page, 'Batalla de crews').getByText('1 inscrito')).toBeHidden();
});

const pressed = (page: Page) => kinds(page).locator('button[aria-pressed="true"]');
// Bgirl 1v1 as the only competition, so archiving it leaves its kind with no visible activity.
const soleCompetition = activities.filter(
  (entry) => entry.kind !== 'competition' || entry.name === 'Bgirl 1v1',
);

test('keeps the selected kind chip after archiving its last active activity', async ({ page }) => {
  let rows = soleCompetition;
  await mockCatalog(page, soleCompetition);
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
    .getByRole('button', { name: /^Competencias/ })
    .click();
  await page.getByRole('button', { name: 'Archivar Bgirl 1v1' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Archivar' }).click();
  await expect(page.getByRole('status')).toContainText('Archivaste Bgirl 1v1.');

  await expect(pressed(page)).toHaveText('Competencias 0');
  await expect(page.getByText('Ninguna actividad de este tipo')).toBeVisible();
  await kinds(page)
    .getByRole('button', { name: /^Todas/ })
    .click();
  await expect(kinds(page).getByRole('button', { name: /^Competencias/ })).toHaveCount(0);
});
