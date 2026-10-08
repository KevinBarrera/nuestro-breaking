import { expect, test, type Page } from '@playwright/test';

// Pass screens have their own routes: a list, a create screen and a detail screen per pass.
const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const battleId = 'd1b2c3d4-1234-4567-89ab-123456789abc';
const fullPassId = 'f1b2c3d4-1234-4567-89ab-123456789abc';
const archivedPassId = 'f2b2c3d4-1234-4567-89ab-123456789abc';
const createdPassId = 'f3b2c3d4-1234-4567-89ab-123456789abc';
const passesPath = `/admin/events/${eventId}/passes`;
const apiPassTypesPath = `/admin/events/${eventId}/pass-types`;
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

const archivedPass = {
  ...fullPass,
  id: archivedPassId,
  name: 'Pase viejo',
  status: 'archived',
  version: 4,
  activities: [],
};

const createdPass = {
  ...fullPass,
  id: createdPassId,
  name: 'Entrada general',
  passClass: 'general',
  priceCents: 30000,
  version: 1,
  activities: [],
};

async function mockCatalog(page: Page, rows: () => unknown[]) {
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
    (url) => api(url) && url.pathname === apiPassTypesPath,
    (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: rows() });
    },
  );
}

const breadcrumb = (page: Page) => page.getByRole('navigation', { name: 'Ruta de navegación' });
const sideNav = (page: Page) => page.getByRole('navigation', { name: 'Navegación administrativa' });
const passCard = (page: Page, name: string) =>
  page.getByRole('listitem').filter({ has: page.getByRole('heading', { name }) });

async function expectPasesHighlighted(page: Page) {
  await expect(sideNav(page).getByRole('link', { name: 'Pases' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(sideNav(page).getByRole('link', { name: 'Actividades' })).not.toHaveAttribute(
    'aria-current',
  );
}

test('a pass card opens its detail route and the breadcrumb leads back to the list', async ({
  page,
}) => {
  await mockCatalog(page, () => [fullPass]);
  await page.goto(passesPath);
  await expect(page.getByRole('heading', { name: 'Pases', level: 1 })).toBeVisible();
  await expectPasesHighlighted(page);
  const card = passCard(page, 'Pase completo');
  const target = card.getByRole('link', { name: 'Editar Pase completo', exact: true });
  await expect(target).toHaveAttribute('href', `${passesPath}/${fullPassId}`);
  await target.click();

  await expect(page).toHaveURL(`${passesPath}/${fullPassId}`);
  await expect(page.getByRole('heading', { name: 'Pase completo', level: 1 })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Editar pase' }).getByLabel('Nombre')).toHaveValue(
    'Pase completo',
  );
  await expect(page.getByRole('region', { name: 'Mapa de acceso' })).toBeVisible();
  await expectPasesHighlighted(page);

  const trail = breadcrumb(page);
  await expect(trail.getByRole('listitem')).toHaveText(['Pases', 'Pase completo']);
  await expect(trail.getByText('Pase completo')).toHaveAttribute('aria-current', 'page');
  const back = trail.getByRole('link', { name: 'Pases' });
  expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await back.click();
  await expect(page).toHaveURL(passesPath);
  await expect(passCard(page, 'Pase completo')).toBeVisible();
});

test('a deep link to a pass loads it once the catalog is ready', async ({ page }) => {
  await mockCatalog(page, () => [fullPass]);
  await page.goto(`${passesPath}/${fullPassId}`);
  const form = page.getByRole('form', { name: 'Editar pase' });
  await expect(form.getByLabel('Nombre')).toHaveValue('Pase completo');
  await expect(form).toContainText('v2');
});

for (const [label, id] of [
  ['an unknown', 'f9b2c3d4-1234-4567-89ab-123456789abc'],
  ['an archived', archivedPassId],
] as const)
  test(`${label} pass id shows a not-found state with a way back`, async ({ page }) => {
    await mockCatalog(page, () => [fullPass, archivedPass]);
    await page.goto(`${passesPath}/${id}`);
    await expect(
      page.getByRole('heading', { name: 'No encontramos este pase', level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole('form')).toHaveCount(0);
    await expectPasesHighlighted(page);
    await page.getByRole('link', { name: 'Volver a Pases' }).click();
    await expect(page).toHaveURL(passesPath);
  });

test('the create route saves a new pass and lands on its detail route', async ({ page }) => {
  let rows: unknown[] = [fullPass];
  await mockCatalog(page, () => rows);
  await page.route(
    (url) => api(url) && url.pathname === apiPassTypesPath,
    (route) => {
      if (route.request().method() === 'GET') return route.fallback();
      expect(route.request().method()).toBe('POST');
      rows = [...rows, createdPass];
      return route.fulfill({ status: 201, json: createdPass });
    },
  );
  await page.goto(passesPath);
  await page.getByRole('link', { name: 'Nuevo pase' }).click();
  await expect(page).toHaveURL(`${passesPath}/new`);
  await expectPasesHighlighted(page);
  await expect(breadcrumb(page).getByRole('listitem')).toHaveText(['Pases', 'Nuevo pase']);
  const form = page.getByRole('form', { name: 'Nuevo pase' });
  await form.getByLabel('Nombre').fill('Entrada general');
  await form.getByRole('radio', { name: 'General' }).check();
  await form.getByLabel('Precio (MXN)').fill('300');
  await form.getByRole('button', { name: 'Guardar' }).click();

  await expect(page).toHaveURL(`${passesPath}/${createdPassId}`);
  await expect(page.getByRole('status')).toContainText('Pase creado');
  await expect(page.getByRole('form', { name: 'Editar pase' }).getByLabel('Nombre')).toHaveValue(
    'Entrada general',
  );
});

test('cancel on the create route returns to the list', async ({ page }) => {
  await mockCatalog(page, () => [fullPass]);
  await page.goto(`${passesPath}/new`);
  await page
    .getByRole('form', { name: 'Nuevo pase' })
    .getByRole('button', { name: 'Cancelar' })
    .click();
  await expect(page).toHaveURL(passesPath);
});

test('archiving a pass returns to the list with the success notice', async ({ page }) => {
  let current: Record<string, unknown> = fullPass;
  await mockCatalog(page, () => [current]);
  await page.route(
    (url) => api(url) && url.pathname === `${apiPassTypesPath}/${fullPassId}/archive`,
    (route) => {
      current = { ...fullPass, status: 'archived', version: 3 };
      return route.fulfill({ json: current });
    },
  );
  await page.goto(`${passesPath}/${fullPassId}`);
  const form = page.getByRole('form', { name: 'Editar pase' });
  await form.getByRole('button', { name: 'Archivar' }).click();
  await form.getByRole('button', { name: 'Confirmar archivo' }).click();
  await expect(page).toHaveURL(passesPath);
  await expect(page.getByRole('status')).toContainText('Pase archivado');
  await expect(passCard(page, 'Pase completo')).toContainText('Archivado');
});

test('the old pass-types address redirects to the passes list', async ({ page }) => {
  await mockCatalog(page, () => [fullPass]);
  await page.goto(`/admin/events/${eventId}/pass-types`);
  await expect(page).toHaveURL(passesPath);
  await expect(passCard(page, 'Pase completo')).toBeVisible();
});

test('the pass detail and its breadcrumb fit a 375px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await mockCatalog(page, () => [fullPass]);
  await page.goto(`${passesPath}/${fullPassId}`);
  await expect(breadcrumb(page).getByRole('link', { name: 'Pases' })).toBeVisible();
  expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(
    375,
  );
});
