import { expect, test, type Page, type Route } from '@playwright/test';
import { mockEventTimeZone } from './support/event-mocks.ts';

// The pass list (#372): Activos / Archivados tabs, passes grouped by class in table rows with
// vendidos (attendee-lists snapshot) and the online sale pill (event sales), the warning for a
// pass that gives access to nothing, and restore without confirmation.
const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const battleId = 'd1b2c3d4-1234-4567-89ab-123456789abc';
const fullPassId = 'f1b2c3d4-1234-4567-89ab-123456789abc';
const oldPassId = 'f2b2c3d4-1234-4567-89ab-123456789abc';
const goldenId = 'f3b2c3d4-1234-4567-89ab-123456789abc';
const wackingId = 'f4b2c3d4-1234-4567-89ab-123456789abc';
const openId = 'f5b2c3d4-1234-4567-89ab-123456789abc';
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
  onlineSalesClosesAt: null,
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

const golden = {
  ...fullPass,
  id: goldenId,
  name: 'Golden ticket',
  priceCents: 0,
  activities: [{ activityId: battleId, access: 'included' }],
};
const wacking = { ...fullPass, id: wackingId, name: 'Wacking', activities: [] };
const general = { ...oldPass, id: 'f6b2c3d4-1234-4567-89ab-123456789abc', status: 'active' };
const openStyles = {
  ...fullPass,
  id: openId,
  name: 'Open Styles',
  passClass: 'add_on',
  priceCents: 80000,
  requiresPassClass: 'full',
  // Closed on November 1st: the pill reads "Venta cerrada" even while the event sells.
  onlineSalesClosesAt: '2026-11-01T05:59:00.000Z',
  activities: [{ activityId: battleId, access: 'included' }],
};

const registration = (id: string, status: string, passTypeIds: string[]) => ({
  registrationId: id,
  folio: null,
  fullName: id,
  stageName: null,
  status,
  eventCheckedInAt: null,
  passTypeIds,
  activities: [],
});

const attendeeLists = {
  event: { id: eventId, name: 'Evento' },
  generatedAt: '2026-11-10T12:00:00.000Z',
  passTypes: [],
  activities: [],
  registrations: [
    registration('r1', 'confirmed', [fullPassId, openId]),
    registration('r2', 'confirmed', [fullPassId]),
    // Pending payments are not sold yet.
    registration('r3', 'pending_payment', [fullPassId, goldenId]),
  ],
};

const sales = (state: 'open' | 'closed') => ({
  slug: 'evento',
  salesEnabled: state === 'open',
  salesOpensAt: null,
  salesClosesAt: null,
  state,
  reason: state === 'open' ? null : 'disabled',
});

type Options = {
  restore?: (route: Route) => unknown;
  // `null` answers 500, so the column or the event sale state is unknown.
  lists?: unknown;
  sale?: unknown;
};

// The pass list always returns `rows()`, so a successful restore can change the next read.
async function mockCatalog(page: Page, rows: () => unknown[], options: Options = {}) {
  const { restore, lists = attendeeLists, sale = sales('open') } = options;
  await page.clock.setFixedTime(new Date('2026-11-10T12:00:00.000Z'));
  await mockEventTimeZone(page, eventId);
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
            kind: 'competition',
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
    (url) => api(url) && url.pathname === `/admin/events/${eventId}/attendee-lists`,
    (route) =>
      lists === null ? route.fulfill({ status: 500, json: {} }) : route.fulfill({ json: lists }),
  );
  await page.route(
    (url) => api(url) && url.pathname === `/admin/events/${eventId}/sales`,
    (route) =>
      sale === null ? route.fulfill({ status: 500, json: {} }) : route.fulfill({ json: sale }),
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

const panel = (page: Page) => page.getByRole('tabpanel');
const group = (page: Page, name: string) => panel(page).getByRole('region', { name });
const row = (page: Page, name: string) =>
  panel(page)
    .getByRole('listitem')
    .filter({ has: page.getByText(name, { exact: true }) });

test('groups the active passes by class with price, access, vendidos and the sale pill', async ({
  page,
}) => {
  await mockCatalog(page, () => [openStyles, fullPass, general, golden, oldPass]);
  await page.goto(passesPath);

  await expect(page.getByRole('heading', { name: 'Pases', level: 1 })).toBeVisible();
  await expect(
    page.getByText(
      'Lo que el público compra. Cada pase tiene un precio y define a qué actividades da acceso.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Activos 4' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tab', { name: 'Archivados 1' })).toBeVisible();

  // Full, general, then add-ons, each with its one-line explanation.
  await expect(panel(page).getByRole('heading', { level: 2 })).toHaveText([
    'Pases completos',
    'Entrada general',
    'Adicionales',
  ]);
  await expect(group(page, 'Pases completos')).toContainText(
    'Dan acceso a actividades. Es el pase de quien compite.',
  );
  await expect(group(page, 'Entrada general')).toContainText('Solo la entrada al evento.');
  await expect(group(page, 'Adicionales')).toContainText('Se compran junto con un pase completo.');

  const full = row(page, 'Pase completo');
  await expect(full).toContainText('$1,500.00');
  await expect(full).toContainText('Elige entre 1');
  await expect(full).toContainText('2 vendidos');
  await expect(full).toContainText('En venta');
  await expect(row(page, 'Golden ticket')).toContainText('Sin costo');
  await expect(row(page, 'Golden ticket')).toContainText('Incluye 1 actividad');
  await expect(row(page, 'Golden ticket')).toContainText('0 vendidos');
  await expect(row(page, 'Pase viejo')).toContainText('Entrada al evento');
  const open = row(page, 'Open Styles');
  await expect(open).toContainText('Incluye 1 actividad · Requiere pase completo');
  await expect(open).toContainText('1 vendido');
  await expect(open).toContainText('Venta cerrada');
  // The old "Activo" pill is gone, and the archived pass stays in its own tab.
  await expect(panel(page).getByText('Activo', { exact: true })).toHaveCount(0);

  // The whole row is one link named from its cells, leading to the pass.
  const link = full.getByRole('link');
  await expect(link).toHaveAccessibleName(
    'Pase completo, $1,500.00, Elige entre 1, 2 vendidos, En venta. Editar pase',
  );
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await link.click();
  await expect(page).toHaveURL(`${passesPath}/${fullPassId}`);
});

test('a closed event sale closes every pill, and the unknown snapshot hides vendidos', async ({
  page,
}) => {
  await mockCatalog(page, () => [fullPass], { sale: sales('closed'), lists: null });
  await page.goto(passesPath);
  const full = row(page, 'Pase completo');
  await expect(full).toContainText('Venta cerrada');
  await expect(full).not.toContainText('vendido');
  await expect(group(page, 'Pases completos')).not.toContainText('Vendidos');
});

test('an unknown event sale state leaves the pill to the pass date', async ({ page }) => {
  await mockCatalog(page, () => [fullPass, openStyles], { sale: null });
  await page.goto(passesPath);
  await expect(row(page, 'Pase completo')).toContainText('En venta');
  await expect(row(page, 'Open Styles')).toContainText('Venta cerrada');
});

test('warns about a full pass that gives access to no activity', async ({ page }) => {
  await mockCatalog(page, () => [fullPass, wacking, general]);
  await page.goto(passesPath);
  await expect(row(page, 'Wacking')).toContainText('No da acceso a ninguna actividad');
  await expect(row(page, 'Wacking').getByRole('link')).toHaveAccessibleName(
    /Atención: no da acceso a ninguna actividad\. Editar pase$/,
  );
  await expect(row(page, 'Pase completo')).not.toContainText('No da acceso');
  await expect(row(page, 'Pase viejo')).not.toContainText('No da acceso');
  await expect(panel(page).getByRole('status')).toHaveText(
    'Wacking no da acceso a ninguna actividad. Quien lo compre no podrá inscribirse a competencias. Ábrelo y elige sus actividades, o cámbialo a Entrada general.',
  );
});

test('Archivados lists archived passes with a named "Restaurar" and no link', async ({ page }) => {
  await mockCatalog(page, () => [fullPass, oldPass]);
  await page.goto(passesPath);
  await expect(row(page, 'Pase viejo')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Archivados 1' }).click();
  const old = row(page, 'Pase viejo');
  await expect(group(page, 'Entrada general')).toBeVisible();
  await expect(old).toContainText('$300.00');
  await expect(old).toContainText('Archivado');
  await expect(old.getByRole('link')).toHaveCount(0);
  const restore = old.getByRole('button', { name: 'Restaurar Pase viejo' });
  await expect(restore).toHaveText('Restaurar');
  expect((await restore.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(panel(page).getByRole('status')).toHaveCount(0);

  // Arrow keys move between the tabs.
  await page.getByRole('tab', { name: 'Archivados 1' }).press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Activos 1' })).toBeFocused();
  await expect(row(page, 'Pase completo')).toBeVisible();
});

test('restores without confirmation, with the notice and focus on the heading', async ({
  page,
}) => {
  let current = oldPass;
  const bodies: unknown[] = [];
  await mockCatalog(page, () => [fullPass, current], {
    restore: async (route) => {
      expect(route.request().headers()['x-csrf-token']).toBe('safe-token');
      bodies.push(route.request().postDataJSON());
      current = { ...oldPass, status: 'active', version: 5 };
      await route.fulfill({ json: current });
    },
  });
  await page.goto(passesPath);
  await page.getByRole('tab', { name: 'Archivados 1' }).click();
  await page.getByRole('button', { name: 'Restaurar Pase viejo' }).click();

  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByRole('status').first()).toContainText(
    'Restauraste Pase viejo. Vuelve a estar en venta.',
  );
  await expect(page.getByRole('heading', { name: 'Pases', level: 1 })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Archivados 0' })).toBeVisible();
  await expect(panel(page)).toContainText('No hay pases archivados');
  await expect(panel(page)).toContainText(
    'Cuando archives un pase aparecerá aquí. Quien ya lo compró lo conserva.',
  );
  expect(bodies).toEqual([{ expectedVersion: 4 }]);

  await page.getByRole('button', { name: 'Cerrar aviso' }).click();
  await expect(page.getByText('Restauraste Pase viejo')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Activos 2' }).click();
  await expect(row(page, 'Pase viejo')).toContainText('En venta');
});

test('a 409 explains the name conflict with "Recargar" and keeps the pass archived', async ({
  page,
}) => {
  await mockCatalog(page, () => [fullPass, oldPass], {
    restore: (route) =>
      route.fulfill({
        status: 409,
        json: { message: 'An active pass type already uses this name' },
      }),
  });
  await page.goto(passesPath);
  await page.getByRole('tab', { name: 'Archivados 1' }).click();
  await page.getByRole('button', { name: 'Restaurar Pase viejo' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('No se pudo restaurar');
  await expect(alert).toContainText('pase activo con ese nombre');
  await expect(alert.getByRole('button', { name: 'Recargar' })).toBeVisible();
  await expect(page.getByText('An active pass type already uses')).toHaveCount(0);
  await expect(page.getByText('Restauraste')).toHaveCount(0);
  await expect(row(page, 'Pase viejo')).toContainText('Archivado');
});

test('an event without passes shows the way to start', async ({ page }) => {
  await mockCatalog(page, () => []);
  await page.goto(passesPath);
  await expect(page.getByRole('tab')).toHaveCount(0);
  const empty = page.getByRole('region', { name: 'Aún no hay pases' });
  await expect(empty).toContainText(
    'Crea lo que vas a vender: un pase completo por disciplina, una entrada general y, si quieres, adicionales como Open Styles.',
  );
  await expect(empty).toContainText(
    'Conviene crear antes las actividades: al armar el pase eliges a cuáles da acceso.',
  );
  await expect(empty.getByRole('link', { name: 'actividades' })).toHaveAttribute(
    'href',
    `/admin/events/${eventId}/activities`,
  );
  await empty.getByRole('link', { name: 'Crear el primer pase' }).click();
  await expect(page).toHaveURL(`${passesPath}/new`);
});

test('an archived pass URL points to "Archivados" to restore it', async ({ page }) => {
  await mockCatalog(page, () => [fullPass, oldPass]);
  await page.goto(`${passesPath}/${oldPassId}`);
  await expect(
    page.getByRole('heading', { name: 'No encontramos este pase', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(/pestaña «Archivados»/)).toBeVisible();
  await page.getByRole('link', { name: 'Volver a Pases' }).click();
  await expect(page).toHaveURL(passesPath);
});

test('the list stacks at phone width without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await mockCatalog(page, () => [fullPass, wacking, openStyles, general]);
  await page.goto(passesPath);
  await expect(row(page, 'Pase completo')).toContainText('$1,500.00');
  await expect(group(page, 'Pases completos').getByText('Precio', { exact: true })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
