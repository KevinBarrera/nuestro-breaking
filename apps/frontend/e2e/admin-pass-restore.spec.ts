import { expect, test, type Page, type Route } from '@playwright/test';

// Archived passes leave the main list for an "Archivados" section, where "Restaurar" asks in a
// confirmation dialog before calling the restore endpoint.
const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const battleId = 'd1b2c3d4-1234-4567-89ab-123456789abc';
const fullPassId = 'f1b2c3d4-1234-4567-89ab-123456789abc';
const oldPassId = 'f2b2c3d4-1234-4567-89ab-123456789abc';
const passesPath = `/admin/events/${eventId}/passes`;
const apiPassTypesPath = `/admin/events/${eventId}/pass-types`;
const restorePath = `${apiPassTypesPath}/${oldPassId}/restore`;
const api = (url: URL) => url.port === '3000';

const fullPass = {
  id: fullPassId,
  eventId,
  name: 'Pase completo',
  passClass: 'full',
  priceCents: 150000,
  requiresPassClass: null,
  status: 'active',
  version: 2,
  activities: [{ activityId: battleId, access: 'selectable' }],
};

const oldPass = {
  ...fullPass,
  id: oldPassId,
  name: 'Pase viejo',
  passClass: 'general',
  priceCents: 30000,
  status: 'archived',
  version: 4,
  activities: [],
};

// `restore` answers the POST; the pass list always returns `rows()`, so a successful restore
// can update what the next read returns.
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
    (url) => api(url) && url.pathname === `/admin/events/${eventId}/activities`,
    (route) =>
      route.fulfill({
        json: [
          {
            id: battleId,
            eventId,
            venueId: 'e1b2c3d4-1234-4567-89ab-123456789abc',
            kind: 'battle',
            name: 'Batalla de crews',
            startsAt: '2026-11-14T16:00:00.000Z',
            endsAt: '2026-11-14T18:00:00.000Z',
            status: 'active',
            version: 1,
          },
        ],
      }),
  );
  await page.route(
    (url) => api(url) && url.pathname.startsWith(apiPassTypesPath),
    async (route) => {
      const { pathname } = new URL(route.request().url());
      if (route.request().method() === 'GET' && pathname === apiPassTypesPath)
        return route.fulfill({ json: rows() });
      if (route.request().method() === 'POST' && pathname === restorePath && restore)
        return restore(route);
      return route.fulfill({ status: 500, json: {} });
    },
  );
}

const mainList = (page: Page) => page.getByRole('region', { name: 'Lista de pases' });
const archivedSection = (page: Page) => page.getByRole('region', { name: 'Archivados' });
const card = (scope: ReturnType<typeof mainList>, name: string) =>
  scope.getByRole('listitem').filter({ has: scope.page().getByRole('heading', { name }) });

async function confirmRestore(page: Page) {
  await card(archivedSection(page), 'Pase viejo')
    .getByRole('button', { name: 'Restaurar Pase viejo' })
    .click();
  const confirm = page.getByRole('alertdialog', { name: '¿Restaurar Pase viejo?' });
  await confirm.getByRole('button', { name: 'Restaurar' }).click();
  return confirm;
}

test('lists archived passes only in "Archivados", each with a named "Restaurar"', async ({
  page,
}) => {
  await mockCatalog(page, () => [fullPass, oldPass]);
  await page.goto(passesPath);

  const main = mainList(page);
  await expect(card(main, 'Pase completo')).toBeVisible();
  await expect(card(main, 'Pase viejo')).toHaveCount(0);

  const archived = archivedSection(page);
  await expect(archived.getByRole('heading', { name: 'Archivados' })).toBeVisible();
  await expect(archived.getByRole('listitem')).toHaveCount(1);
  const old = card(archived, 'Pase viejo');
  await expect(old).toContainText('General');
  await expect(old).toContainText('$300.00');
  await expect(old).toContainText('Archivado');
  // No link to the detail screen: the only control is "Restaurar".
  await expect(old.getByRole('link')).toHaveCount(0);
  await expect(old.getByRole('button')).toHaveCount(1);
  const restore = old.getByRole('button', { name: 'Restaurar Pase viejo' });
  await expect(restore).toHaveText('Restaurar');
  expect((await restore.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('hides "Archivados" when no pass is archived', async ({ page }) => {
  await mockCatalog(page, () => [fullPass]);
  await page.goto(passesPath);
  await expect(card(mainList(page), 'Pase completo')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Archivados' })).toHaveCount(0);
  await expect(archivedSection(page)).toHaveCount(0);
});

test('"Cancelar" sends nothing and returns focus to "Restaurar"', async ({ page }) => {
  const bodies: unknown[] = [];
  await mockCatalog(
    page,
    () => [fullPass, oldPass],
    (route) => {
      bodies.push(route.request().postDataJSON());
      return route.fulfill({ json: { ...oldPass, status: 'active', version: 5 } });
    },
  );
  await page.goto(passesPath);
  const restore = page.getByRole('button', { name: 'Restaurar Pase viejo' });

  await restore.click();
  const confirm = page.getByRole('alertdialog', { name: '¿Restaurar Pase viejo?' });
  await expect(confirm).toContainText(
    'Volverá a estar activo con los mismos accesos que tenía y se podrá asignar de nuevo.',
  );
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(restore).toBeFocused();
  expect(bodies).toEqual([]);
});

test('restores after confirmation, moving the pass to the main list and focusing it', async ({
  page,
}) => {
  let current = oldPass;
  const bodies: unknown[] = [];
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await mockCatalog(
    page,
    () => [fullPass, current],
    async (route) => {
      expect(route.request().headers()['x-csrf-token']).toBe('safe-token');
      bodies.push(route.request().postDataJSON());
      await held;
      current = { ...oldPass, status: 'active', version: 5 };
      await route.fulfill({ json: current });
    },
  );
  await page.goto(passesPath);

  const confirm = await confirmRestore(page);
  await expect(confirm.getByRole('button', { name: 'Restaurando…' })).toBeDisabled();
  await expect(confirm.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(confirm).toBeVisible();
  release();

  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Pase restaurado.');
  const restored = card(mainList(page), 'Pase viejo');
  await expect(restored).toContainText('Activo');
  // The "Restaurar" button is gone, so focus moves to the restored card's link.
  await expect(
    restored.getByRole('link', { name: 'Editar Pase viejo', exact: true }),
  ).toBeFocused();
  // It was the only archived pass, so the section goes away.
  await expect(archivedSection(page)).toHaveCount(0);
  expect(bodies).toEqual([{ expectedVersion: 4 }]);
});

test('a 409 explains the name conflict with "Recargar" and keeps the pass archived', async ({
  page,
}) => {
  await mockCatalog(
    page,
    () => [fullPass, oldPass],
    (route) =>
      route.fulfill({
        status: 409,
        json: { message: 'An active pass type already uses this name' },
      }),
  );
  await page.goto(passesPath);
  await confirmRestore(page);

  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('No se pudo restaurar');
  await expect(alert).toContainText('pase activo con ese nombre');
  await expect(alert).toContainText('cambia el nombre de uno de los dos');
  await expect(alert.getByRole('button', { name: 'Recargar' })).toBeVisible();
  await expect(page.getByText('An active pass type already uses')).toHaveCount(0);
  await expect(page.getByText('Pase restaurado')).toHaveCount(0);
  await expect(card(archivedSection(page), 'Pase viejo')).toContainText('Archivado');
});

test('an archived pass URL points to "Archivados" to restore it', async ({ page }) => {
  await mockCatalog(page, () => [fullPass, oldPass]);
  await page.goto(`${passesPath}/${oldPassId}`);
  await expect(
    page.getByRole('heading', { name: 'No encontramos este pase', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(/sección «Archivados»/)).toBeVisible();
  await expect(page.getByText('ya no se pueden editar')).toHaveCount(0);
  await page.getByRole('link', { name: 'Volver a Pases' }).click();
  await expect(page).toHaveURL(passesPath);
  await expect(card(archivedSection(page), 'Pase viejo')).toBeVisible();
});
