import { expect, test, type Page } from '@playwright/test';

const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const otherId = 'b1b2c3d4-1234-4567-89ab-123456789abc';
const venueId = 'e1b2c3d4-1234-4567-89ab-123456789abc';
const battleId = 'd1b2c3d4-1234-4567-89ab-123456789abc';
const finalId = 'd2b2c3d4-1234-4567-89ab-123456789abc';
const workshopId = 'd3b2c3d4-1234-4567-89ab-123456789abc';
const oldId = 'd4b2c3d4-1234-4567-89ab-123456789abc';
const overviewPath = `/admin/events/${eventId}`;
const api = (url: URL) => url.port === '3000';

const events = [
  { id: eventId, name: 'Encuentro del barrio' },
  { id: otherId, name: 'Batalla de otoño' },
];

const activity = (id: string, kind: string, name: string, status = 'active') => ({
  id,
  venueId,
  kind,
  name,
  startsAt: '2026-11-14T16:00:00.000Z',
  endsAt: '2026-11-14T18:00:00.000Z',
  status,
  version: 1,
});

const activities = [
  activity(battleId, 'battle', 'Batalla de crews'),
  activity(finalId, 'battle', 'Final 1 vs 1'),
  activity(workshopId, 'workshop', 'Taller de footwork'),
  activity(oldId, 'battle', 'Batalla cancelada', 'archived'),
];

const passType = (overrides: Record<string, unknown>) => ({
  requiresPassClass: null,
  status: 'active',
  version: 1,
  activities: [],
  ...overrides,
});

const passTypes = [
  passType({
    id: 'f1b2c3d4-1234-4567-89ab-123456789abc',
    name: 'Pase completo',
    passClass: 'full',
    priceCents: 150000,
    activities: [
      { activityId: battleId, access: 'selectable' },
      { activityId: finalId, access: 'selectable' },
      { activityId: workshopId, access: 'included' },
    ],
  }),
  passType({
    id: 'f2b2c3d4-1234-4567-89ab-123456789abc',
    name: 'Entrada general',
    passClass: 'general',
    priceCents: 30000,
  }),
  passType({
    id: 'f3b2c3d4-1234-4567-89ab-123456789abc',
    name: 'Open Styles',
    passClass: 'add_on',
    priceCents: 25000,
    requiresPassClass: 'full',
    activities: [{ activityId: battleId, access: 'selectable' }],
  }),
  passType({
    id: 'f4b2c3d4-1234-4567-89ab-123456789abc',
    name: 'Pase anticipado',
    passClass: 'full',
    priceCents: 120000,
    status: 'archived',
  }),
];

// Rows carry the event id from the request path, so any event in the selector can load.
async function mockCatalog(page: Page, status = 200, rows = { activities, passTypes }) {
  const catalog = { activities: rows.activities, 'pass-types': rows.passTypes };
  await page.route(
    (url) => api(url) && /^\/admin\/events\/[^/]+\/(activities|pass-types)$/.test(url.pathname),
    (route) => {
      if (status !== 200) return route.fulfill({ status, json: {} });
      const [, , , requested, resource] = new URL(route.request().url()).pathname.split('/');
      const rows = catalog[resource as keyof typeof catalog];
      return route.fulfill({ json: rows.map((row) => ({ ...row, eventId: requested })) });
    },
  );
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => api(url) && url.pathname === '/auth/session',
    (route) => route.fulfill({ json: { user: { id: 'admin', roles: ['admin'] } } }),
  );
  await page.route(
    (url) => api(url) && url.pathname === '/admin/events',
    (route) => route.fulfill({ json: events }),
  );
});

const sideNav = (page: Page) => page.getByRole('navigation', { name: 'Navegación administrativa' });

test('shows the event overview with quick actions and Resumen as the current page', async ({
  page,
}) => {
  await mockCatalog(page);
  await page.goto(overviewPath);
  await expect(page.getByRole('heading', { level: 1, name: 'Resumen del evento' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Encuentro del barrio');
  await expect(page.getByText('por confirmar', { exact: false })).toHaveCount(0);

  const resumen = sideNav(page).getByRole('link', { name: 'Resumen' });
  await expect(resumen).toHaveAttribute('href', overviewPath);
  await expect(resumen).toHaveAttribute('aria-current', 'page');

  const actions = page.getByRole('region', { name: 'Acciones rápidas' });
  await expect(actions.getByRole('link', { name: /Abrir check-in/ })).toHaveAttribute(
    'href',
    `${overviewPath}/check-in`,
  );
  for (const name of ['Registrar en el lugar', 'Imprimir listas']) {
    const action = actions.getByRole('button', { name: new RegExp(name) });
    await expect(action).toHaveAttribute('aria-disabled', 'true');
    await expect(action).toContainText('Próximamente');
    await expect(actions.getByRole('link', { name: new RegExp(name) })).toHaveCount(0);
  }
  const box = await actions.getByRole('link', { name: /Abrir check-in/ }).boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test('derives catalog counts from the active activities and pass types', async ({ page }) => {
  await mockCatalog(page);
  await page.goto(overviewPath);
  const catalog = page.getByRole('region', { name: 'Catálogo' });
  const stat = (label: string) => catalog.getByRole('listitem').filter({ hasText: label });
  await expect(stat('pases activos')).toContainText('3');
  await expect(stat('batallas')).toContainText('2');
  await expect(stat('talleres')).toContainText('1');
  await expect(catalog.getByRole('listitem')).toHaveCount(3);
  await expect(catalog.getByRole('link', { name: 'Editar' })).toHaveAttribute(
    'href',
    `${overviewPath}/pass-types`,
  );
});

test('lists active pass types with class, derived access and formatted price', async ({ page }) => {
  await mockCatalog(page);
  await page.goto(overviewPath);
  const table = page.getByRole('table', { name: 'Pases a la venta' });
  await expect(table.getByRole('row')).toHaveCount(4);
  const row = (name: string) =>
    table.getByRole('row').filter({ has: page.getByRole('rowheader', { name, exact: true }) });
  await expect(row('Pase completo')).toContainText('Completo');
  await expect(row('Pase completo')).toContainText('2 actividades a elegir');
  await expect(row('Pase completo')).toContainText('Taller de footwork');
  await expect(row('Pase completo')).toContainText('$1,500.00');
  await expect(row('Entrada general')).toContainText('General');
  await expect(row('Entrada general')).toContainText('Sin actividades');
  await expect(row('Entrada general')).toContainText('$300.00');
  await expect(row('Open Styles')).toContainText('Adicional');
  await expect(row('Open Styles')).toContainText('1 actividad a elegir');
  await expect(row('Open Styles')).toContainText('Requiere pase completo');
  await expect(row('Open Styles')).toContainText('$250.00');
  await expect(table.getByText('Pase anticipado')).toHaveCount(0);
  const price = row('Pase completo').getByRole('cell').last();
  await expect(price).toHaveCSS('text-align', 'right');
});

test('summarizes access from active activities only and names unknown kinds as sent', async ({
  page,
}) => {
  const toprockId = 'd5b2c3d4-1234-4567-89ab-123456789abc';
  const powerId = 'd6b2c3d4-1234-4567-89ab-123456789abc';
  const cypherId = 'd7b2c3d4-1234-4567-89ab-123456789abc';
  const link = (activityId: string, access: string) => ({ activityId, access });
  await mockCatalog(page, 200, {
    activities: [
      ...activities,
      activity(toprockId, 'workshop', 'Taller de toprock'),
      activity(powerId, 'workshop', 'Taller de power'),
      activity(cypherId, 'cypher', 'Cypher abierto'),
    ],
    passTypes: [
      passType({
        id: 'f1b2c3d4-1234-4567-89ab-123456789abc',
        name: 'Pase talleres',
        passClass: 'full',
        priceCents: 90000,
        activities: [
          link(workshopId, 'included'),
          link(toprockId, 'included'),
          link(powerId, 'included'),
          link(oldId, 'included'),
        ],
      }),
      passType({
        id: 'f2b2c3d4-1234-4567-89ab-123456789abc',
        name: 'Pase mixto',
        passClass: 'full',
        priceCents: 80000,
        activities: [
          link(battleId, 'selectable'),
          link(oldId, 'selectable'),
          link(workshopId, 'included'),
        ],
      }),
      passType({
        id: 'f3b2c3d4-1234-4567-89ab-123456789abc',
        name: 'Pase cancelado',
        passClass: 'general',
        priceCents: 10000,
        activities: [link(oldId, 'selectable')],
      }),
    ],
  });
  await page.goto(overviewPath);
  const table = page.getByRole('table', { name: 'Pases a la venta' });
  const row = (name: string) =>
    table.getByRole('row').filter({ has: page.getByRole('rowheader', { name, exact: true }) });
  // The archived inclusion is not counted: three, not four, and above two they are counted.
  await expect(row('Pase talleres')).toContainText('3 actividades incluidas');
  await expect(row('Pase talleres')).not.toContainText('Incluye');
  await expect(row('Pase mixto')).toContainText(
    '1 actividad a elegir · Incluye Taller de footwork',
  );
  await expect(row('Pase cancelado')).toContainText('Sin actividades');
  await expect(table.getByText('Batalla cancelada')).toHaveCount(0);

  const catalog = page.getByRole('region', { name: 'Catálogo' });
  const stat = (label: string) => catalog.getByRole('listitem').filter({ hasText: label });
  await expect(stat('talleres')).toContainText('3');
  await expect(stat('cypher')).toContainText('1');
});

test('keeps the catalog summary when the event list fails', async ({ page }) => {
  await page.route(
    (url) => api(url) && url.pathname === '/admin/events',
    (route) => route.fulfill({ status: 500, json: { message: 'private' } }),
  );
  await mockCatalog(page);
  await page.goto(overviewPath);
  await expect(page.getByRole('heading', { level: 1, name: 'Resumen del evento' })).toBeVisible();
  const catalog = page.getByRole('region', { name: 'Catálogo' });
  await expect(catalog.getByRole('listitem').filter({ hasText: 'pases activos' })).toContainText(
    '3',
  );
  await expect(page.getByRole('table', { name: 'Pases a la venta' }).getByRole('row')).toHaveCount(
    4,
  );
  await expect(page.getByRole('main')).not.toContainText('Encuentro del barrio');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('private')).toHaveCount(0);
});

test('keeps the overview when switching events', async ({ page }) => {
  await mockCatalog(page);
  await page.goto(overviewPath);
  const selector = page.getByRole('combobox', { name: 'Evento' });
  await expect(selector).toHaveValue(eventId);
  await selector.selectOption(otherId);
  await expect(page).toHaveURL(new RegExp(`/admin/events/${otherId}$`));
  await expect(page.getByRole('main')).toContainText('Batalla de otoño');
});

test('shows empty states when the catalog has nothing active', async ({ page }) => {
  await page.route(
    (url) => api(url) && /\/(activities|pass-types)$/.test(url.pathname),
    (route) => route.fulfill({ json: [] }),
  );
  await page.goto(overviewPath);
  await expect(page.getByText('Aún no hay actividades activas.')).toBeVisible();
  await expect(page.getByText('Aún no hay pases a la venta.')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('shows a load failure when the catalog cannot be read', async ({ page }) => {
  await mockCatalog(page, 500);
  await page.goto(overviewPath);
  await expect(page.getByRole('alert')).toContainText('No se pudo cargar el catálogo');
  await expect(page.getByRole('region', { name: 'Acciones rápidas' })).toBeVisible();
});

test('shows a no-access state when the catalog is denied', async ({ page }) => {
  await mockCatalog(page, 403);
  await page.goto(overviewPath);
  await expect(page.getByRole('alert')).toContainText('Sin acceso');
});

test('fits a 375px viewport and scrolls the pass table inside its box', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await mockCatalog(page);
  await page.goto(overviewPath);
  const table = page.getByRole('table', { name: 'Pases a la venta' });
  await expect(table).toBeVisible();
  expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(
    375,
  );
  const box = page.getByTestId('pass-table-scroll');
  expect(await box.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  await expect(box).toHaveCSS('overflow-x', 'auto');
});
