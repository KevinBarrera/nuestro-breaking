import { expect, test, type Page, type Route } from '@playwright/test';

// Archived activities (shown with "Mostrar archivadas") offer "Restaurar", which asks in a
// confirmation dialog before calling the restore endpoint.
const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const venueId = 'e1b2c3d4-1234-4567-89ab-123456789abc';
const battleId = 'd1b2c3d4-1234-4567-89ab-123456789abc';
const cypherId = 'd3b2c3d4-1234-4567-89ab-123456789abc';
const activitiesPath = `/admin/events/${eventId}/activities`;
const restorePath = `${activitiesPath}/${cypherId}/restore`;
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
  kind: 'battle',
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

// `restore` answers the POST; the activity list always returns `rows()`, so a successful
// restore can update what the next read returns.
async function mockCatalog(page: Page, rows: () => unknown[], restore?: (route: Route) => unknown) {
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
    (url) => api(url) && url.pathname.startsWith(activitiesPath),
    async (route) => {
      const { pathname } = new URL(route.request().url());
      if (route.request().method() === 'GET' && pathname === activitiesPath)
        return route.fulfill({ json: rows() });
      if (route.request().method() === 'POST' && pathname === restorePath && restore)
        return restore(route);
      return route.fulfill({ status: 500, json: {} });
    },
  );
}

async function showArchived(page: Page) {
  await page.goto(activitiesPath);
  await page.getByRole('checkbox', { name: 'Mostrar archivadas' }).check();
}

const row = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name });

test('offers "Restaurar" only on archived rows, named after the activity', async ({ page }) => {
  await mockCatalog(page, () => [battle, cypher]);
  await showArchived(page);

  const archived = row(page, 'Cypher cancelado');
  await expect(archived).toContainText('Archivada');
  await expect(archived.getByRole('button')).toHaveCount(1);
  const restore = archived.getByRole('button', { name: 'Restaurar Cypher cancelado' });
  await expect(restore).toBeVisible();
  expect((await restore.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  const active = row(page, 'Batalla de crews');
  await expect(active.getByRole('button', { name: /Restaurar/ })).toHaveCount(0);
  await expect(active.getByRole('button', { name: 'Editar' })).toBeVisible();
});

test('"Cancelar" sends nothing and returns focus to "Restaurar"', async ({ page }) => {
  const bodies: unknown[] = [];
  await mockCatalog(
    page,
    () => [battle, cypher],
    (route) => {
      bodies.push(route.request().postDataJSON());
      return route.fulfill({ json: { ...cypher, status: 'active', version: 6 } });
    },
  );
  await showArchived(page);
  const restore = row(page, 'Cypher cancelado').getByRole('button', { name: /Restaurar/ });

  await restore.click();
  const confirm = page.getByRole('alertdialog', { name: '¿Restaurar Cypher cancelado?' });
  await expect(confirm).toContainText('Volverá a estar activa');
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(restore).toBeFocused();
  expect(bodies).toEqual([]);
});

test('restores after confirmation, blocking repeats while pending', async ({ page }) => {
  let current = cypher;
  const bodies: unknown[] = [];
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await mockCatalog(
    page,
    () => [battle, current],
    async (route) => {
      expect(route.request().headers()['x-csrf-token']).toBe('safe-token');
      bodies.push(route.request().postDataJSON());
      await held;
      current = { ...cypher, status: 'active', version: 6 };
      await route.fulfill({ json: current });
    },
  );
  await showArchived(page);
  const restored = row(page, 'Cypher cancelado');

  await restored.getByRole('button', { name: /Restaurar/ }).click();
  const confirm = page.getByRole('alertdialog', { name: '¿Restaurar Cypher cancelado?' });
  await confirm.getByRole('button', { name: 'Restaurar' }).click();
  await expect(confirm.getByRole('button', { name: 'Restaurando…' })).toBeDisabled();
  await expect(confirm.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(confirm).toBeVisible();
  release();

  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Actividad restaurada.');
  await expect(restored).toContainText('Activa');
  await expect(restored.getByRole('button', { name: /Restaurar/ })).toHaveCount(0);
  await expect(restored.getByRole('button', { name: 'Archivar' })).toBeVisible();
  // The "Restaurar" button is gone, so focus moves to the restored row's "Editar".
  await expect(restored.getByRole('button', { name: 'Editar' })).toBeFocused();
  expect(bodies).toEqual([{ expectedVersion: 5 }]);
});

test('a 409 shows a visible alert with "Recargar" and no success', async ({ page }) => {
  await mockCatalog(
    page,
    () => [battle, cypher],
    (route) =>
      route.fulfill({
        status: 409,
        json: { message: 'Activity no longer fits its venue or the event window' },
      }),
  );
  await showArchived(page);

  await row(page, 'Cypher cancelado')
    .getByRole('button', { name: /Restaurar/ })
    .click();
  await page
    .getByRole('alertdialog', { name: '¿Restaurar Cypher cancelado?' })
    .getByRole('button', { name: 'Restaurar' })
    .click();

  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('No se pudo restaurar');
  await expect(alert).toContainText('sede');
  await expect(alert.getByRole('button', { name: 'Recargar' })).toBeVisible();
  await expect(page.getByText('Activity no longer fits')).toHaveCount(0);
  await expect(page.getByText('Actividad restaurada')).toHaveCount(0);
  await expect(row(page, 'Cypher cancelado')).toContainText('Archivada');
});
