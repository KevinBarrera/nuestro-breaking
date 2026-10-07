import { expect, test, type Page } from '@playwright/test';

const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const venueId = 'e1b2c3d4-1234-4567-89ab-123456789abc';
const crewsId = 'd1b2c3d4-1234-4567-89ab-123456789abc';
const duoId = 'd2b2c3d4-1234-4567-89ab-123456789abc';
const footworkId = 'd3b2c3d4-1234-4567-89ab-123456789abc';
const oldWorkshopId = 'd4b2c3d4-1234-4567-89ab-123456789abc';
const fullPassId = 'f1b2c3d4-1234-4567-89ab-123456789abc';
const generalPassId = 'f2b2c3d4-1234-4567-89ab-123456789abc';
const oldPassId = 'f3b2c3d4-1234-4567-89ab-123456789abc';
const passTypesPath = `/admin/events/${eventId}/pass-types`;
const accessPath = `${passTypesPath}/${fullPassId}/activities`;
const api = (url: URL) => url.port === '3000';

type Access = { activityId: string; access: 'selectable' | 'included' };

const activity = (id: string, kind: string, name: string, status = 'active') => ({
  id,
  eventId,
  venueId,
  kind,
  name,
  startsAt: '2026-11-14T16:00:00.000Z',
  endsAt: '2026-11-14T18:00:00.000Z',
  status,
  version: 1,
});

const activities = [
  activity(footworkId, 'workshop', 'Taller de footwork'),
  activity(crewsId, 'battle', 'Batalla de crews'),
  activity(oldWorkshopId, 'workshop', 'Taller viejo', 'archived'),
  activity(duoId, 'battle', 'Batalla 2 vs 2'),
];

const pass = (id: string, name: string, version: number, links: Access[], overrides = {}) => ({
  id,
  eventId,
  name,
  passClass: 'full',
  priceCents: 150000,
  requiresPassClass: null,
  status: 'active',
  version,
  activities: links,
  ...overrides,
});

const fullPass = pass(fullPassId, 'Pase completo', 2, [
  { activityId: crewsId, access: 'selectable' },
  { activityId: footworkId, access: 'included' },
  { activityId: oldWorkshopId, access: 'included' },
]);
const generalPass = pass(generalPassId, 'Entrada general', 1, [], { passClass: 'general' });
const oldPass = pass(oldPassId, 'Pase viejo', 4, [{ activityId: crewsId, access: 'included' }], {
  status: 'archived',
});

async function mockCatalog(page: Page, rows: () => unknown[]) {
  let passReads = 0;
  await page.route(
    (url) => api(url) && url.pathname === `/admin/events/${eventId}/activities`,
    (route) => route.fulfill({ json: activities }),
  );
  await page.route(
    (url) => api(url) && url.pathname === passTypesPath,
    (route) => {
      passReads++;
      return route.fulfill({ json: rows() });
    },
  );
  return () => passReads;
}

async function mockAccessWrite(
  page: Page,
  respond: (body: unknown) => { status: number; json: unknown },
) {
  const bodies: unknown[] = [];
  await page.route(
    (url) => api(url) && url.pathname.startsWith(`${passTypesPath}/`),
    (route) => {
      const request = route.request();
      expect(request.method()).toBe('PUT');
      expect(new URL(request.url()).pathname).toBe(accessPath);
      expect(request.headers()['x-csrf-token']).toBe('safe-token');
      const body: unknown = request.postDataJSON();
      bodies.push(body);
      return route.fulfill(respond(body));
    },
  );
  return bodies;
}

async function selectPass(page: Page, name: string) {
  await page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name }) })
    .getByRole('button', { name: 'Editar', exact: true })
    .click();
}

const map = (page: Page) => page.getByRole('region', { name: 'Mapa de acceso' });
const cell = (page: Page, pass: string, activityName: string) =>
  map(page).getByLabel(`${pass} · ${activityName}`, { exact: true });

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => api(url) && url.pathname === '/auth/session',
    (route) =>
      route.fulfill({
        headers: { 'X-CSRF-Token': 'safe-token', 'Access-Control-Expose-Headers': 'X-CSRF-Token' },
        json: { user: { id: 'admin', roles: ['admin'] } },
      }),
  );
});

test('renders active activities against active passes with read-only chips', async ({ page }) => {
  await mockCatalog(page, () => [fullPass, generalPass, oldPass]);
  await page.goto(passTypesPath);
  const table = map(page).getByRole('table');
  await expect(map(page)).toContainText('Elegible (la persona escoge)');
  await expect(table.getByRole('columnheader')).toHaveText([
    'Actividad',
    'Pase completo',
    'Entrada general',
  ]);
  await expect(table.getByRole('rowheader')).toHaveText([
    'Batalla · Batalla 2 vs 2',
    'Batalla · Batalla de crews',
    'Taller · Taller de footwork',
  ]);
  const cellsOf = (name: string) =>
    table
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name }) })
      .getByRole('cell');
  await expect(cellsOf('Batalla · Batalla 2 vs 2')).toHaveText([/Sin acceso/, /Sin acceso/]);
  await expect(cellsOf('Batalla · Batalla de crews')).toHaveText(['Elegible', /Sin acceso/]);
  await expect(cellsOf('Taller · Taller de footwork')).toHaveText(['Incluida', /Sin acceso/]);
  await expect(table.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guardar acceso' })).toHaveCount(0);
});

test('selecting a pass card makes its column editable and opens the panel', async ({ page }) => {
  await mockCatalog(page, () => [fullPass, generalPass]);
  await page.goto(passTypesPath);
  await selectPass(page, 'Pase completo');
  await expect(page.getByRole('form', { name: 'Editar pase' })).toBeVisible();
  await expect(cell(page, 'Pase completo', 'Batalla de crews')).toHaveValue('selectable');
  await expect(cell(page, 'Pase completo', 'Taller de footwork')).toHaveValue('included');
  await expect(cell(page, 'Pase completo', 'Batalla 2 vs 2')).toHaveValue('none');
  await expect(cell(page, 'Entrada general', 'Batalla de crews')).toHaveCount(0);
  const box = await cell(page, 'Pase completo', 'Batalla de crews').boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await selectPass(page, 'Entrada general');
  await expect(cell(page, 'Entrada general', 'Batalla de crews')).toHaveValue('none');
  await expect(cell(page, 'Pase completo', 'Batalla de crews')).toHaveCount(0);
});

test('keeps Guardar acceso disabled until the selected column changes', async ({ page }) => {
  await mockCatalog(page, () => [fullPass]);
  const bodies = await mockAccessWrite(page, () => ({ status: 200, json: fullPass }));
  await page.goto(passTypesPath);
  await selectPass(page, 'Pase completo');
  const save = map(page).getByRole('button', { name: 'Guardar acceso' });
  await expect(save).toBeDisabled();
  await cell(page, 'Pase completo', 'Batalla de crews').selectOption('included');
  await expect(save).toBeEnabled();
  await cell(page, 'Pase completo', 'Batalla de crews').selectOption('selectable');
  await expect(save).toBeDisabled();
  expect(bodies).toHaveLength(0);
});

test('saves the selected column with one PUT carrying expectedVersion and the full list', async ({
  page,
}) => {
  let current = fullPass;
  await mockCatalog(page, () => [current, generalPass]);
  const bodies = await mockAccessWrite(page, (body) => {
    current = {
      ...fullPass,
      version: 3,
      activities: (body as { activities: Access[] }).activities,
    };
    return { status: 200, json: current };
  });
  await page.goto(passTypesPath);
  await selectPass(page, 'Pase completo');
  await expect(map(page)).toContainText('se quitará al guardar');
  await cell(page, 'Pase completo', 'Batalla 2 vs 2').selectOption('selectable');
  await cell(page, 'Pase completo', 'Taller de footwork').selectOption('none');
  await map(page).getByRole('button', { name: 'Guardar acceso' }).click();
  await expect(page.getByRole('status')).toContainText('Acceso actualizado');
  expect(bodies).toEqual([
    {
      expectedVersion: 2,
      activities: [
        { activityId: duoId, access: 'selectable' },
        { activityId: crewsId, access: 'selectable' },
      ],
    },
  ]);
  await expect(page.getByRole('form', { name: 'Editar pase' })).toContainText('v3');
  await expect(cell(page, 'Pase completo', 'Taller de footwork')).toHaveValue('none');
  await expect(map(page).getByRole('button', { name: 'Guardar acceso' })).toBeDisabled();
  await expect(map(page)).not.toContainText('se quitará al guardar');
});

test('a stale version shows a conflict with a reload that discards local edits', async ({
  page,
}) => {
  let current = fullPass;
  const passReads = await mockCatalog(page, () => [current, generalPass]);
  const bodies = await mockAccessWrite(page, () => ({
    status: 409,
    json: { message: 'Pass type version conflict' },
  }));
  await page.goto(passTypesPath);
  await selectPass(page, 'Pase completo');
  await cell(page, 'Pase completo', 'Batalla 2 vs 2').selectOption('included');
  await map(page).getByRole('button', { name: 'Guardar acceso' }).click();
  const conflict = page.getByRole('alert').filter({ hasText: 'Otra persona cambió este pase' });
  await expect(conflict).toBeVisible();
  await expect(page.getByText('Pass type version conflict')).toHaveCount(0);
  await expect(page.getByText('Acceso actualizado')).toHaveCount(0);
  expect(bodies).toHaveLength(1);
  current = {
    ...fullPass,
    version: 5,
    activities: [{ activityId: crewsId, access: 'included' }],
  };
  const readsBefore = passReads();
  await conflict.getByRole('button', { name: 'Recargar' }).click();
  await expect.poll(passReads).toBeGreaterThan(readsBefore);
  await expect(cell(page, 'Pase completo', 'Batalla de crews')).toHaveValue('included');
  await expect(cell(page, 'Pase completo', 'Batalla 2 vs 2')).toHaveValue('none');
  await expect(page.getByRole('form', { name: 'Editar pase' })).toContainText('v5');
  await expect(map(page).getByRole('button', { name: 'Guardar acceso' })).toBeDisabled();
  await expect(conflict).toHaveCount(0);
});

test('other access failures show the generic failure notice', async ({ page }) => {
  await mockCatalog(page, () => [fullPass]);
  await mockAccessWrite(page, () => ({ status: 500, json: {} }));
  await page.goto(passTypesPath);
  await selectPass(page, 'Pase completo');
  await cell(page, 'Pase completo', 'Batalla 2 vs 2').selectOption('included');
  await map(page).getByRole('button', { name: 'Guardar acceso' }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo completar la operación');
  await expect(cell(page, 'Pase completo', 'Batalla 2 vs 2')).toHaveValue('included');
});

test('fits a 375px viewport and scrolls the access map inside its box', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await mockCatalog(page, () => [fullPass, generalPass]);
  await page.goto(passTypesPath);
  await selectPass(page, 'Pase completo');
  await expect(cell(page, 'Pase completo', 'Batalla de crews')).toBeVisible();
  expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(
    375,
  );
  const box = page.getByTestId('access-map-scroll');
  await expect(box).toHaveCSS('overflow-x', 'auto');
  expect(await box.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
});
