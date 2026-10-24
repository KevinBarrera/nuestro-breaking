import { expect, test, type Page, type Route } from '@playwright/test';

// Archiving asks first and can be undone from the notice; "Restaurar" (under Archivadas) restores
// right away, and can be undone too.
const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const venueId = 'e1b2c3d4-1234-4567-89ab-123456789abc';
const battleId = 'd1b2c3d4-1234-4567-89ab-123456789abc';
const cypherId = 'd3b2c3d4-1234-4567-89ab-123456789abc';
const activitiesPath = `/admin/events/${eventId}/activities`;
const listsPath = `/admin/events/${eventId}/attendee-lists`;
const api = (url: URL) => url.port === '3000';

const foundation = {
  event: {
    id: eventId,
    name: 'Encuentro del barrio',
    timeZone: 'America/Mexico_City',
    startsAt: '2026-11-14T15:00:00.000Z',
    endsAt: '2026-11-16T05:00:00.000Z',
    windowStatus: 'bounded',
  },
  venues: [{ id: venueId, name: 'Centro cultural' }],
  activities: [],
  deferredFields: [],
};

const battle = {
  id: battleId,
  eventId,
  venueId,
  kind: 'competition',
  name: 'Batalla de crews',
  startsAt: '2026-11-14T16:00:00.000Z',
  endsAt: '2026-11-14T18:00:00.000Z',
  status: 'active',
  version: 3,
};

const cypher = {
  ...battle,
  id: cypherId,
  kind: 'social',
  name: 'Cypher cancelado',
  startsAt: '2026-11-14T19:00:00.000Z',
  endsAt: '2026-11-14T20:00:00.000Z',
  status: 'archived',
  version: 5,
};

type Write = (route: Route, action: 'archive' | 'restore', id: string) => unknown;

// `write` answers archive and restore POSTs; the activity list always returns `rows()`, so a
// write can change what the next read returns. Two inscritos have access to Batalla de crews.
async function mockCatalog(page: Page, rows: () => unknown[], write?: Write) {
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
    (url) => api(url) && url.pathname === listsPath,
    (route) =>
      route.fulfill({
        json: {
          event: { id: eventId, name: 'Encuentro del barrio' },
          generatedAt: '2026-11-10T12:00:00.000Z',
          passTypes: [],
          activities: [
            { id: battleId, name: battle.name, kind: 'competition', startsAt: battle.startsAt },
          ],
          registrations: ['r1', 'r2'].map((id) => ({
            registrationId: id,
            folio: null,
            fullName: id,
            stageName: null,
            status: 'confirmed',
            eventCheckedInAt: null,
            passTypeIds: [],
            activities: [{ activityId: battleId, checkedInAt: null }],
          })),
        },
      }),
  );
  await page.route(
    (url) => api(url) && url.pathname.startsWith(activitiesPath),
    async (route) => {
      const { pathname } = new URL(route.request().url());
      if (route.request().method() === 'GET' && pathname === activitiesPath)
        return route.fulfill({ json: rows() });
      const match = /\/([^/]+)\/(archive|restore)$/.exec(pathname);
      if (route.request().method() === 'POST' && match && write)
        return write(route, match[2] as 'archive' | 'restore', match[1]);
      return route.fulfill({ status: 500, json: {} });
    },
  );
}

// A store the writes change, answering like the API.
function store(initial: (typeof battle)[]) {
  let rows = initial;
  const bodies: unknown[] = [];
  const write: Write = (route, action, id) => {
    bodies.push({ action, ...route.request().postDataJSON() });
    rows = rows.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            status: action === 'archive' ? 'archived' : 'active',
            version: entry.version + 1,
          }
        : entry,
    );
    return route.fulfill({ json: rows.find((entry) => entry.id === id) });
  };
  return { rows: () => rows, write, bodies };
}

const row = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name });
const heading = (page: Page) => page.getByRole('heading', { name: 'Actividades', level: 1 });

test('archives only after the confirmation, which warns about inscritos and blocks repeats', async ({
  page,
}) => {
  const bodies: unknown[] = [];
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await mockCatalog(
    page,
    () => [battle, cypher],
    async (route) => {
      bodies.push(route.request().postDataJSON());
      await held;
      await route.fulfill({ json: { ...battle, status: 'archived', version: 4 } });
    },
  );
  await page.goto(activitiesPath);
  const archive = page.getByRole('button', { name: 'Archivar Batalla de crews' });

  await archive.click();
  const confirm = page.getByRole('alertdialog', { name: '¿Archivar Batalla de crews?' });
  await expect(confirm).toContainText(
    'Deja de aparecer en la venta y en los pases nuevos. Puedes restaurarla cuando quieras desde Archivadas.',
  );
  await expect(confirm).toContainText(
    '2 personas ya están inscritas. Conservan su inscripción; avísales si la actividad ya no se hará.',
  );
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(archive).toBeFocused();
  expect(bodies).toEqual([]);

  await archive.click();
  await confirm.getByRole('button', { name: 'Archivar' }).click();
  await expect(confirm.getByRole('button', { name: 'Archivando…' })).toBeDisabled();
  await expect(confirm.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(confirm).toBeVisible();
  release();

  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Archivaste Batalla de crews.');
  // The archived row leaves the tab with its button, so focus lands on the page heading.
  await expect(heading(page)).toBeFocused();
  expect(bodies).toEqual([{ expectedVersion: 3 }]);
});

test('an archive without inscritos does not warn', async ({ page }) => {
  await mockCatalog(page, () => [{ ...cypher, status: 'active' }]);
  await page.goto(activitiesPath);

  await page.getByRole('button', { name: 'Archivar Cypher cancelado' }).click();
  await expect(page.getByRole('alertdialog')).not.toContainText('inscrit');
});

test('"Deshacer" restores what was just archived and closes the notice', async ({ page }) => {
  const api = store([battle, cypher]);
  await mockCatalog(page, api.rows, api.write);
  await page.goto(activitiesPath);

  await page.getByRole('button', { name: 'Archivar Batalla de crews' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Archivar' }).click();
  const notice = page.getByRole('status').filter({ hasText: 'Archivaste Batalla de crews.' });
  await notice.getByRole('button', { name: 'Deshacer' }).click();

  await expect(notice).toHaveCount(0);
  await expect(row(page, 'Batalla de crews')).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Activas/ })).toHaveText('Activas 1');
  expect(api.bodies).toEqual([
    { action: 'archive', expectedVersion: 3 },
    { action: 'restore', expectedVersion: 4 },
  ]);
});

test('restores right away from Archivadas, and "Deshacer" archives it again', async ({ page }) => {
  const api = store([battle, cypher]);
  await mockCatalog(page, api.rows, api.write);
  await page.goto(activitiesPath);
  await page.getByRole('tab', { name: /^Archivadas/ }).click();

  await page.getByRole('button', { name: 'Restaurar Cypher cancelado' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  const notice = page.getByRole('status').filter({ hasText: 'Restauraste Cypher cancelado.' });
  await expect(notice).toContainText('Vuelve a aparecer en los pases que la incluyen.');
  await expect(page.getByText('No hay actividades archivadas')).toBeVisible();
  await expect(heading(page)).toBeFocused();

  await notice.getByRole('button', { name: 'Deshacer' }).click();
  await expect(row(page, 'Cypher cancelado')).toBeVisible();
  await expect(notice).toHaveCount(0);
  expect(api.bodies).toEqual([
    { action: 'restore', expectedVersion: 5 },
    { action: 'archive', expectedVersion: 6 },
  ]);
});

test('"Cerrar aviso" closes the notice without undoing', async ({ page }) => {
  const api = store([battle, cypher]);
  await mockCatalog(page, api.rows, api.write);
  await page.goto(activitiesPath);
  await page.getByRole('tab', { name: /^Archivadas/ }).click();
  await page.getByRole('button', { name: 'Restaurar Cypher cancelado' }).click();

  await page.getByRole('button', { name: 'Cerrar aviso' }).click();
  await expect(page.getByText('Restauraste Cypher cancelado.')).toHaveCount(0);
  expect(api.bodies).toHaveLength(1);
});

test('a restore 409 shows a visible alert with "Recargar" and no success', async ({ page }) => {
  await mockCatalog(
    page,
    () => [battle, cypher],
    (route) =>
      route.fulfill({
        status: 409,
        json: { message: 'Activity no longer fits its venue or the event window' },
      }),
  );
  await page.goto(activitiesPath);
  await page.getByRole('tab', { name: /^Archivadas/ }).click();

  await page.getByRole('button', { name: 'Restaurar Cypher cancelado' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('No se pudo restaurar');
  await expect(alert).toContainText('sede');
  await expect(alert.getByRole('button', { name: 'Recargar' })).toBeVisible();
  await expect(page.getByText('Activity no longer fits')).toHaveCount(0);
  await expect(page.getByText('Restauraste')).toHaveCount(0);
  await expect(row(page, 'Cypher cancelado')).toBeVisible();
});

test('opening the editor drops the "Deshacer" notice, so no undo sends an older version', async ({
  page,
}) => {
  const api = store([battle, { ...cypher, status: 'active' }]);
  await mockCatalog(page, api.rows, api.write);
  await page.goto(activitiesPath);

  await page.getByRole('button', { name: 'Archivar Cypher cancelado' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Archivar' }).click();
  await expect(page.getByRole('button', { name: 'Deshacer' })).toBeVisible();

  await page.getByRole('button', { name: 'Editar Batalla de crews' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Deshacer' })).toHaveCount(0);
});
