import { expect, test, type Page, type Route } from '@playwright/test';

const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const venueId = 'e1b2c3d4-1234-4567-89ab-123456789abc';
const battleId = 'd1b2c3d4-1234-4567-89ab-123456789abc';
const workshopId = 'd2b2c3d4-1234-4567-89ab-123456789abc';
const createdId = 'd3b2c3d4-1234-4567-89ab-123456789abc';
const fullPassId = 'f1b2c3d4-1234-4567-89ab-123456789abc';
const openPassId = 'f2b2c3d4-1234-4567-89ab-123456789abc';
const activitiesPath = `/admin/events/${eventId}/activities`;
const passTypesPath = `/admin/events/${eventId}/pass-types`;
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

type Activity = {
  id: string;
  eventId: string;
  venueId: string;
  kind: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: 'active' | 'archived';
  version: number;
};

const activity = (overrides: Partial<Activity> = {}): Activity => ({
  id: battleId,
  eventId,
  venueId,
  kind: 'battle',
  name: 'Batalla de crews',
  startsAt: '2026-11-14T16:00:00.000Z',
  endsAt: '2026-11-14T18:00:00.000Z',
  status: 'active',
  version: 3,
  ...overrides,
});

const workshop = activity({
  id: workshopId,
  kind: 'workshop',
  name: 'Taller de footwork',
  startsAt: '2026-11-15T17:00:00.000Z',
  endsAt: '2026-11-15T19:00:00.000Z',
  version: 1,
});

const fullPass = {
  id: fullPassId,
  eventId,
  name: 'Pase completo',
  passClass: 'full',
  priceCents: 150000,
  requiresPassClass: null,
  status: 'active',
  version: 2,
  activities: [
    { activityId: battleId, access: 'selectable' },
    { activityId: workshopId, access: 'included' },
  ],
};

const openStyles = {
  id: openPassId,
  eventId,
  name: 'Open Styles',
  passClass: 'add_on',
  priceCents: 25000,
  requiresPassClass: 'full',
  status: 'active',
  version: 1,
  activities: [],
};

function json(route: Route) {
  return route.request().postDataJSON() as Record<string, unknown>;
}

async function mockFoundation(page: Page) {
  await page.route(
    (url) => api(url) && url.pathname === `/admin/events/${eventId}/foundation`,
    (route) => route.fulfill({ json: foundation }),
  );
}

async function mockActivityList(page: Page, rows: () => Activity[]) {
  let reads = 0;
  await page.route(
    (url) => api(url) && url.pathname === activitiesPath,
    (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      reads++;
      return route.fulfill({ json: rows() });
    },
  );
  return () => reads;
}

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

test('admin landing links each event to its activity and pass catalogs', async ({ page }) => {
  await page.route(
    (url) => api(url) && url.pathname === '/admin/events',
    (route) => route.fulfill({ json: [{ id: eventId, name: 'Encuentro del barrio' }] }),
  );
  await page.goto('/admin');
  const catalog = page.getByRole('region', { name: 'Catálogo de eventos' });
  await expect(
    catalog.getByRole('link', { name: 'Actividades de Encuentro del barrio' }),
  ).toHaveAttribute('href', activitiesPath);
  await expect(
    catalog.getByRole('link', { name: 'Pases de Encuentro del barrio' }),
  ).toHaveAttribute('href', passTypesPath);
});

test('lists activities with kind, venue, schedule in event time and status', async ({ page }) => {
  await mockFoundation(page);
  await mockActivityList(page, () => [
    activity(),
    activity({ id: workshopId, name: 'Taller viejo', status: 'archived' }),
  ]);
  await page.goto(activitiesPath);
  const battle = page.getByRole('listitem').filter({ hasText: 'Batalla de crews' });
  await expect(battle).toContainText('battle');
  await expect(battle).toContainText('Centro cultural');
  await expect(battle).toContainText('10:00');
  await expect(battle).toContainText('Activa');
  await expect(page.getByRole('listitem').filter({ hasText: 'Taller viejo' })).toContainText(
    'Archivada',
  );
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: 'Taller viejo' })
      .getByRole('button', { name: 'Editar' }),
  ).toHaveCount(0);
});

test('creates an activity with CSRF and event-time instants, then refreshes the list', async ({
  page,
}) => {
  await mockFoundation(page);
  let rows = [activity()];
  const reads = await mockActivityList(page, () => rows);
  let body: Record<string, unknown> | undefined;
  await page.route(
    (url) => api(url) && url.pathname === activitiesPath,
    (route) => {
      if (route.request().method() === 'GET') return route.fallback();
      expect(route.request().method()).toBe('POST');
      expect(route.request().headers()['x-csrf-token']).toBe('safe-token');
      body = json(route);
      const created = activity({
        id: createdId,
        name: 'Taller de toprock',
        kind: 'workshop',
        version: 1,
      });
      rows = [...rows, created];
      return route.fulfill({ status: 201, json: created });
    },
  );
  await page.goto(activitiesPath);
  await expect(page.getByText('Batalla de crews')).toBeVisible();
  const readsBeforeWrite = reads();
  await page.getByRole('button', { name: 'Nueva actividad' }).click();
  const form = page.getByRole('form', { name: 'Nueva actividad' });
  await form.getByLabel('Nombre').fill('Taller de toprock');
  await form.getByLabel('Tipo').fill('workshop');
  await form.getByLabel('Sede').selectOption(venueId);
  await form.getByLabel('Inicio').fill('2026-11-14T12:00');
  await form.getByLabel('Fin').fill('2026-11-14T13:30');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('status')).toContainText('Actividad creada');
  await expect(page.getByText('Taller de toprock')).toBeVisible();
  expect(body).toEqual({
    name: 'Taller de toprock',
    kind: 'workshop',
    venueId,
    startsAt: '2026-11-14T18:00:00.000Z',
    endsAt: '2026-11-14T19:30:00.000Z',
  });
  // Development StrictMode may repeat the initial read, so assert a read after the write.
  expect(reads()).toBeGreaterThan(readsBeforeWrite);
});

test('edits an activity with its expected version', async ({ page }) => {
  await mockFoundation(page);
  let current = activity();
  await mockActivityList(page, () => [current]);
  let body: Record<string, unknown> | undefined;
  await page.route(
    (url) => api(url) && url.pathname === `${activitiesPath}/${battleId}`,
    (route) => {
      expect(route.request().method()).toBe('PATCH');
      expect(route.request().headers()['x-csrf-token']).toBe('safe-token');
      body = json(route);
      current = activity({ name: 'Batalla 2 vs 2', version: 4 });
      return route.fulfill({ json: current });
    },
  );
  await page.goto(activitiesPath);
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Batalla de crews' })
    .getByRole('button', { name: 'Editar' })
    .click();
  const form = page.getByRole('form', { name: 'Editar actividad' });
  await expect(form.getByLabel('Inicio')).toHaveValue('2026-11-14T10:00');
  await form.getByLabel('Nombre').fill('Batalla 2 vs 2');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('status')).toContainText('Actividad actualizada');
  await expect(page.getByText('Batalla 2 vs 2')).toBeVisible();
  expect(body).toEqual({
    expectedVersion: 3,
    name: 'Batalla 2 vs 2',
    kind: 'battle',
    venueId,
    startsAt: '2026-11-14T16:00:00.000Z',
    endsAt: '2026-11-14T18:00:00.000Z',
  });
});

test('shows a reload request on a version conflict without claiming success', async ({ page }) => {
  await mockFoundation(page);
  await mockActivityList(page, () => [activity()]);
  await page.route(
    (url) => api(url) && url.pathname === `${activitiesPath}/${battleId}`,
    (route) => route.fulfill({ status: 409, json: { message: 'Activity version conflict' } }),
  );
  await page.goto(activitiesPath);
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Batalla de crews' })
    .getByRole('button', { name: 'Editar' })
    .click();
  const form = page.getByRole('form', { name: 'Editar actividad' });
  await form.getByLabel('Nombre').fill('Otro nombre');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('alert')).toContainText('Recarga');
  await expect(page.getByText('Activity version conflict')).toHaveCount(0);
  await expect(page.getByText('Actividad actualizada')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Recargar' })).toBeVisible();
});

test('archives an activity only after confirmation', async ({ page }) => {
  await mockFoundation(page);
  let current = activity();
  await mockActivityList(page, () => [current]);
  const bodies: Record<string, unknown>[] = [];
  await page.route(
    (url) => api(url) && url.pathname === `${activitiesPath}/${battleId}/archive`,
    (route) => {
      expect(route.request().method()).toBe('POST');
      expect(route.request().headers()['x-csrf-token']).toBe('safe-token');
      bodies.push(json(route));
      current = activity({ status: 'archived', version: 4 });
      return route.fulfill({ json: current });
    },
  );
  await page.goto(activitiesPath);
  const row = page.getByRole('listitem').filter({ hasText: 'Batalla de crews' });
  await row.getByRole('button', { name: 'Archivar' }).click();
  await expect(row.getByText('¿Archivar Batalla de crews?')).toBeVisible();
  expect(bodies).toHaveLength(0);
  await row.getByRole('button', { name: 'Cancelar' }).click();
  expect(bodies).toHaveLength(0);
  await row.getByRole('button', { name: 'Archivar' }).click();
  await row.getByRole('button', { name: 'Confirmar archivo' }).click();
  await expect(page.getByRole('status')).toContainText('Actividad archivada');
  await expect(row).toContainText('Archivada');
  expect(bodies).toEqual([{ expectedVersion: 3 }]);
});

async function mockPassTypes(page: Page, rows: () => unknown[]) {
  await page.route(
    (url) => api(url) && url.pathname === activitiesPath,
    (route) => route.fulfill({ json: [activity(), workshop] }),
  );
  await page.route(
    (url) => api(url) && url.pathname === passTypesPath,
    (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: rows() });
    },
  );
}

test('lists pass types with MXN prices, required class and activity access', async ({ page }) => {
  await mockPassTypes(page, () => [fullPass, openStyles]);
  await page.goto(passTypesPath);
  const full = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Pase completo' }) });
  await expect(full).toContainText('Completo');
  await expect(full).toContainText('$1,500.00');
  await expect(full).toContainText('Batalla de crews · Seleccionable');
  await expect(full).toContainText('Taller de footwork · Incluida');
  const open = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Open Styles' }) });
  await expect(open).toContainText('Adicional');
  await expect(open).toContainText('$250.00');
  await expect(open).toContainText('Requiere pase Completo');
});

test('creates an add-on pass type that requires a pass class', async ({ page }) => {
  let rows: unknown[] = [fullPass];
  await mockPassTypes(page, () => rows);
  let body: Record<string, unknown> | undefined;
  await page.route(
    (url) => api(url) && url.pathname === passTypesPath,
    (route) => {
      if (route.request().method() === 'GET') return route.fallback();
      expect(route.request().method()).toBe('POST');
      expect(route.request().headers()['x-csrf-token']).toBe('safe-token');
      body = json(route);
      rows = [...rows, openStyles];
      return route.fulfill({ status: 201, json: openStyles });
    },
  );
  await page.goto(passTypesPath);
  await page.getByRole('button', { name: 'Nuevo pase' }).click();
  const form = page.getByRole('form', { name: 'Nuevo pase' });
  await expect(form.getByLabel('Requiere pase')).toHaveCount(0);
  await form.getByLabel('Nombre').fill('Open Styles');
  await form.getByLabel('Clase').selectOption('add_on');
  await form.getByLabel('Precio (MXN)').fill('250');
  await form.getByLabel('Requiere pase').selectOption('full');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('status')).toContainText('Pase creado');
  await expect(
    page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Open Styles' }) }),
  ).toBeVisible();
  expect(body).toEqual({
    name: 'Open Styles',
    passClass: 'add_on',
    priceCents: 25000,
    requiresPassClass: 'full',
  });
});

test('saves activity access for a pass type with its expected version', async ({ page }) => {
  let current: typeof fullPass = fullPass;
  await mockPassTypes(page, () => [current]);
  let body: Record<string, unknown> | undefined;
  await page.route(
    (url) => api(url) && url.pathname === `${passTypesPath}/${fullPassId}/activities`,
    (route) => {
      expect(route.request().method()).toBe('PUT');
      expect(route.request().headers()['x-csrf-token']).toBe('safe-token');
      body = json(route);
      current = {
        ...fullPass,
        version: 3,
        activities: [{ activityId: workshopId, access: 'selectable' }],
      };
      return route.fulfill({ json: current });
    },
  );
  await page.goto(passTypesPath);
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Pase completo' })
    .getByRole('button', { name: 'Editar acceso' })
    .click();
  const editor = page.getByRole('form', { name: 'Acceso de Pase completo' });
  await expect(editor.getByLabel('Batalla de crews')).toHaveValue('selectable');
  await editor.getByLabel('Batalla de crews').selectOption('none');
  await editor.getByLabel('Taller de footwork').selectOption('selectable');
  await editor.getByRole('button', { name: 'Guardar acceso' }).click();
  await expect(page.getByRole('status')).toContainText('Acceso actualizado');
  expect(body).toEqual({
    expectedVersion: 2,
    activities: [{ activityId: workshopId, access: 'selectable' }],
  });
  await expect(
    page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: 'Pase completo' }) }),
  ).toContainText('Taller de footwork · Seleccionable');
});

test('a judge or denied session sees a no-access state on both catalogs', async ({ page }) => {
  await page.route(
    (url) => api(url) && url.pathname === '/auth/session',
    (route) => route.fulfill({ json: { user: { id: 'judge', roles: ['judge'] } } }),
  );
  await mockFoundation(page);
  await page.route(
    (url) => api(url) && (url.pathname === activitiesPath || url.pathname === passTypesPath),
    (route) => route.fulfill({ status: 403, json: { message: 'Forbidden' } }),
  );
  await page.goto(activitiesPath);
  await expect(page.getByRole('alert')).toContainText('Sin acceso');
  await expect(page.getByRole('button', { name: 'Nueva actividad' })).toHaveCount(0);
  await page.goto(passTypesPath);
  await expect(page.getByRole('alert')).toContainText('Sin acceso');
  await expect(page.getByRole('button', { name: 'Nuevo pase' })).toHaveCount(0);
});
