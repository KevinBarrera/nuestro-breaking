import { expect, test, type Page, type Route } from '@playwright/test';
import { chooseOption, expectSelected, selectTrigger } from './support/select.ts';

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
  await expect(battle).toContainText('Batalla');
  await expect(battle).toContainText('Centro cultural');
  await expect(battle).toContainText('10:00');
  await expect(battle).toContainText('Activa');
  await expect(page.getByText('Taller viejo')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Mostrar archivadas' }).check();
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
  await chooseOption(selectTrigger(form, 'Sede'), 'Centro cultural');
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

test('requires a venue when the saved one is no longer among the event venues', async ({
  page,
}) => {
  await mockFoundation(page);
  const missingVenueId = 'e9b2c3d4-1234-4567-89ab-123456789abc';
  await mockActivityList(page, () => [activity({ venueId: missingVenueId })]);
  const writes: string[] = [];
  await page.route(
    (url) => api(url) && url.pathname === `${activitiesPath}/${battleId}`,
    (route) => {
      writes.push(route.request().method());
      return route.fulfill({ json: activity() });
    },
  );
  await page.goto(activitiesPath);
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Batalla de crews' })
    .getByRole('button', { name: 'Editar' })
    .click();
  const form = page.getByRole('form', { name: 'Editar actividad' });
  const venue = selectTrigger(form, 'Sede');
  // Venues exist, so the empty state reads as a choice to make, not as "no venues".
  await expect(venue).toHaveText('Elige una sede');
  await expect(form.getByText('Sin sedes')).toHaveCount(0);

  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(form.getByText('Elige la sede de la actividad.')).toBeVisible();
  await expect(venue).toHaveAccessibleDescription('Elige la sede de la actividad.');
  await expect(page.getByText('Actividad actualizada')).toHaveCount(0);
  expect(writes).toEqual([]);

  await chooseOption(venue, 'Centro cultural');
  await expect(form.getByText('Elige la sede de la actividad.')).toHaveCount(0);
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('status')).toContainText('Actividad actualizada');
  expect(writes).toEqual(['PATCH']);
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
  await expect(row).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Mostrar archivadas' }).check();
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
  await expect(full).toContainText('1 actividad a elegir · Incluye Taller de footwork');
  const open = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Open Styles' }) });
  await expect(open).toContainText('Adicional');
  await expect(open).toContainText('$250.00');
  await expect(open).toContainText('Sin actividades · Requiere pase completo');
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
  await expect(selectTrigger(form, 'Requiere pase')).toHaveCount(0);
  await expect(form.getByRole('radio', { name: 'Completo' })).toBeChecked();
  await form.getByLabel('Nombre').fill('Open Styles');
  await form.getByRole('radio', { name: 'Adicional' }).check();
  await form.getByLabel('Precio (MXN)').fill('250');
  await expectSelected(selectTrigger(form, 'Requiere pase'), 'Ninguno');
  await chooseOption(selectTrigger(form, 'Requiere pase'), 'Completo');
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
    .filter({ has: page.getByRole('heading', { name: 'Pase completo' }) })
    .getByRole('button', { name: 'Editar', exact: true })
    .click();
  const editor = page.getByRole('region', { name: 'Mapa de acceso' });
  await expectSelected(selectTrigger(editor, 'Pase completo · Batalla de crews'), 'Elegible');
  await chooseOption(selectTrigger(editor, 'Pase completo · Batalla de crews'), 'Sin acceso');
  await chooseOption(selectTrigger(editor, 'Pase completo · Taller de footwork'), 'Elegible');
  await editor.getByRole('button', { name: 'Guardar acceso' }).click();
  await expect(page.getByRole('status')).toContainText('Acceso actualizado');
  expect(body).toEqual({
    expectedVersion: 2,
    activities: [{ activityId: workshopId, access: 'selectable' }],
  });
  const card = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Pase completo' }) });
  await expect(card).not.toContainText('Incluye Taller de footwork');
  await expect(card).toContainText('1 actividad a elegir');
});

test('a judge or denied session sees a no-access state on both catalogs', async ({ page }) => {
  await page.route(
    (url) => api(url) && url.pathname === '/auth/session',
    (route) => route.fulfill({ json: { user: { id: 'judge', roles: ['judge'] } } }),
  );
  await mockFoundation(page);
  const deniedReads: string[] = [];
  await page.route(
    (url) => api(url) && (url.pathname === activitiesPath || url.pathname === passTypesPath),
    (route) => {
      deniedReads.push(new URL(route.request().url()).pathname);
      return route.fulfill({ status: 401, json: { message: 'Unauthorized' } });
    },
  );
  await page.goto(activitiesPath);
  await expect(page).toHaveURL(activitiesPath);
  await expect(page.getByRole('heading', { name: 'Actividades', level: 1 })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Sin acceso');
  await expect(page.getByRole('button', { name: 'Nueva actividad' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Lista de actividades' })).toHaveCount(0);
  expect(deniedReads).toContain(activitiesPath);
  await page.goto(passTypesPath);
  await expect(page).toHaveURL(passTypesPath);
  await expect(page.getByRole('heading', { name: 'Pases', level: 1 })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Sin acceso');
  await expect(page.getByRole('button', { name: 'Nuevo pase' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Lista de pases' })).toHaveCount(0);
  expect(deniedReads).toContain(passTypesPath);
});

test('an event without venues explains why activities cannot be saved', async ({ page }) => {
  await page.route(
    (url) => api(url) && url.pathname === `/admin/events/${eventId}/foundation`,
    (route) => route.fulfill({ json: { ...foundation, venues: [] } }),
  );
  await mockActivityList(page, () => []);
  let writes = 0;
  await page.route(
    (url) => api(url) && url.pathname === activitiesPath,
    (route) => {
      if (route.request().method() === 'GET') return route.fallback();
      writes++;
      return route.fulfill({ status: 400, json: {} });
    },
  );
  await page.goto(activitiesPath);
  await page.getByRole('button', { name: 'Nueva actividad' }).click();
  const form = page.getByRole('form', { name: 'Nueva actividad' });
  await expect(form.getByText('El evento aún no tiene sedes')).toBeVisible();
  await expect(form.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  await expect(selectTrigger(form, 'Sede')).toBeDisabled();
  expect(writes).toBe(0);
});

test('keeps the success message when the refresh after a write fails', async ({ page }) => {
  await mockFoundation(page);
  let rows = [activity()];
  let failReads = false;
  await page.route(
    (url) => api(url) && url.pathname === activitiesPath,
    (route) => {
      if (route.request().method() === 'GET') {
        if (failReads) return route.fulfill({ status: 500, json: {} });
        return route.fulfill({ json: rows });
      }
      const created = activity({ id: createdId, name: 'Taller de toprock', version: 1 });
      rows = [...rows, created];
      failReads = true;
      return route.fulfill({ status: 201, json: created });
    },
  );
  await page.goto(activitiesPath);
  await page.getByRole('button', { name: 'Nueva actividad' }).click();
  const form = page.getByRole('form', { name: 'Nueva actividad' });
  await form.getByLabel('Nombre').fill('Taller de toprock');
  await form.getByLabel('Tipo').fill('battle');
  await form.getByLabel('Inicio').fill('2026-11-14T12:00');
  await form.getByLabel('Fin').fill('2026-11-14T13:30');
  await form.getByRole('button', { name: 'Guardar' }).click();
  const reloadAlert = page.getByRole('alert').filter({ hasText: 'No se pudo recargar' });
  await expect(reloadAlert).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Actividad creada');
  await expect(page.getByText('Batalla de crews')).toBeVisible();
  failReads = false;
  await reloadAlert.getByRole('button', { name: 'Recargar' }).click();
  await expect(page.getByText('Taller de toprock')).toBeVisible();
  await expect(reloadAlert).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Actividad creada');
});

test('editing an activity keeps stored seconds when the times are unchanged', async ({ page }) => {
  await mockFoundation(page);
  const stored = activity({
    startsAt: '2026-11-14T16:00:45.000Z',
    endsAt: '2026-11-14T18:00:30.000Z',
  });
  await mockActivityList(page, () => [stored]);
  const bodies: Record<string, unknown>[] = [];
  await page.route(
    (url) => api(url) && url.pathname === `${activitiesPath}/${battleId}`,
    (route) => {
      bodies.push(json(route));
      return route.fulfill({ json: { ...stored, version: stored.version + bodies.length } });
    },
  );
  await page.goto(activitiesPath);
  const row = page.getByRole('listitem').filter({ hasText: 'Batalla de crews' });
  await row.getByRole('button', { name: 'Editar' }).click();
  let form = page.getByRole('form', { name: 'Editar actividad' });
  await form.getByLabel('Nombre').fill('Batalla de crews');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('status')).toContainText('Actividad actualizada');
  expect(bodies[0]).toMatchObject({
    startsAt: '2026-11-14T16:00:45.000Z',
    endsAt: '2026-11-14T18:00:30.000Z',
  });
  await row.getByRole('button', { name: 'Editar' }).click();
  form = page.getByRole('form', { name: 'Editar actividad' });
  await form.getByLabel('Fin').fill('2026-11-14T12:30');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toMatchObject({
    startsAt: '2026-11-14T16:00:45.000Z',
    endsAt: '2026-11-14T18:30:00.000Z',
  });
});

test('edits a pass type with its expected version', async ({ page }) => {
  let current: typeof fullPass = fullPass;
  await mockPassTypes(page, () => [current]);
  let body: Record<string, unknown> | undefined;
  await page.route(
    (url) => api(url) && url.pathname === `${passTypesPath}/${fullPassId}`,
    (route) => {
      expect(route.request().method()).toBe('PATCH');
      expect(route.request().headers()['x-csrf-token']).toBe('safe-token');
      body = json(route);
      current = { ...fullPass, name: 'Pase completo VIP', priceCents: 175050, version: 3 };
      return route.fulfill({ json: current });
    },
  );
  await page.goto(passTypesPath);
  const card = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Pase completo' }) });
  await expect(card.getByRole('button', { name: 'Editar', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await card.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Editar', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const form = page.getByRole('form', { name: 'Editar pase' });
  await expect(form).toContainText('v2');
  await expect(form.getByRole('radio', { name: 'Completo' })).toBeChecked();
  await expect(form.getByLabel('Precio (MXN)')).toHaveValue('1500.00');
  await form.getByLabel('Nombre').fill('Pase completo VIP');
  await form.getByLabel('Precio (MXN)').fill('1750,50');
  await form.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('status')).toContainText('Pase actualizado');
  expect(body).toEqual({
    expectedVersion: 2,
    name: 'Pase completo VIP',
    passClass: 'full',
    priceCents: 175050,
    requiresPassClass: null,
  });
  await expect(
    page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: 'Pase completo VIP' }) }),
  ).toContainText('$1,750.50');
});

test('a reload while the pass panel is open refreshes its values with the new version', async ({
  page,
}) => {
  await page.route(
    (url) => api(url) && url.pathname === activitiesPath,
    (route) => route.fulfill({ json: [activity(), workshop] }),
  );
  let rows: unknown[] = [fullPass, openStyles];
  let failReads = false;
  await page.route(
    (url) => api(url) && url.pathname === passTypesPath,
    (route) => {
      if (failReads) return route.fulfill({ status: 500, json: {} });
      return route.fulfill({ json: rows });
    },
  );
  await page.route(
    (url) => api(url) && url.pathname === `${passTypesPath}/${openPassId}`,
    (route) => {
      failReads = true;
      return route.fulfill({ json: { ...openStyles, name: 'Open Styles 2026', version: 2 } });
    },
  );
  let body: Record<string, unknown> | undefined;
  await page.route(
    (url) => api(url) && url.pathname === `${passTypesPath}/${fullPassId}`,
    (route) => {
      body = json(route);
      return route.fulfill({ json: { ...fullPass, version: 6 } });
    },
  );
  await page.goto(passTypesPath);
  const card = (name: string) =>
    page.getByRole('listitem').filter({ has: page.getByRole('heading', { name }) });
  await card('Open Styles').getByRole('button', { name: 'Editar', exact: true }).click();
  const form = page.getByRole('form', { name: 'Editar pase' });
  await form.getByLabel('Nombre').fill('Open Styles 2026');
  await form.getByRole('button', { name: 'Guardar cambios' }).click();
  const reloadAlert = page.getByRole('alert').filter({ hasText: 'No se pudo recargar' });
  await expect(reloadAlert).toBeVisible();

  await card('Pase completo').getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(form).toContainText('v2');
  const access = page.getByRole('region', { name: 'Mapa de acceso' });
  await expectSelected(selectTrigger(access, 'Pase completo · Batalla de crews'), 'Elegible');
  await chooseOption(selectTrigger(access, 'Pase completo · Batalla de crews'), 'Incluida');
  // Another writer changed the pass meanwhile; the retried reload brings version 5.
  rows = [
    {
      ...fullPass,
      name: 'Pase completo plus',
      priceCents: 160000,
      version: 5,
      activities: [{ activityId: workshopId, access: 'included' }],
    },
    openStyles,
  ];
  failReads = false;
  await reloadAlert.getByRole('button', { name: 'Recargar' }).click();
  await expect(reloadAlert).toHaveCount(0);
  await expect(form).toContainText('v5');
  await expect(form.getByLabel('Nombre')).toHaveValue('Pase completo plus');
  await expect(form.getByLabel('Precio (MXN)')).toHaveValue('1600.00');
  await expectSelected(
    selectTrigger(access, 'Pase completo plus · Batalla de crews'),
    'Sin acceso',
  );
  await form.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('status')).toContainText('Pase actualizado');
  expect(body).toEqual({
    expectedVersion: 5,
    name: 'Pase completo plus',
    passClass: 'full',
    priceCents: 160000,
    requiresPassClass: null,
  });
});

test('shows a reload request when a pass type edit conflicts', async ({ page }) => {
  await mockPassTypes(page, () => [fullPass]);
  await page.route(
    (url) => api(url) && url.pathname === `${passTypesPath}/${fullPassId}`,
    (route) => route.fulfill({ status: 409, json: { message: 'Pass type version conflict' } }),
  );
  await page.goto(passTypesPath);
  await page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Pase completo' }) })
    .getByRole('button', { name: 'Editar', exact: true })
    .click();
  const form = page.getByRole('form', { name: 'Editar pase' });
  await form.getByLabel('Nombre').fill('Otro pase');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('alert')).toContainText('Conflicto');
  await expect(page.getByText('Pass type version conflict')).toHaveCount(0);
  await expect(page.getByText('Pase actualizado')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Recargar' })).toBeVisible();
});

test('archives a pass type only after confirmation', async ({ page }) => {
  let current: typeof fullPass = fullPass;
  await mockPassTypes(page, () => [current]);
  const bodies: Record<string, unknown>[] = [];
  await page.route(
    (url) => api(url) && url.pathname === `${passTypesPath}/${fullPassId}/archive`,
    (route) => {
      expect(route.request().method()).toBe('POST');
      expect(route.request().headers()['x-csrf-token']).toBe('safe-token');
      bodies.push(json(route));
      current = { ...fullPass, status: 'archived', version: 3 };
      return route.fulfill({ json: current });
    },
  );
  await page.goto(passTypesPath);
  const row = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Pase completo' }) });
  await expect(row.getByRole('button', { name: 'Archivar' })).toHaveCount(0);
  await row.getByRole('button', { name: 'Editar', exact: true }).click();
  const panel = page.getByRole('form', { name: 'Editar pase' });
  await panel.getByRole('button', { name: 'Archivar' }).click();
  await expect(panel.getByText('¿Archivar Pase completo?')).toBeVisible();
  await panel.getByRole('button', { name: 'Cancelar' }).click();
  expect(bodies).toHaveLength(0);
  await panel.getByRole('button', { name: 'Archivar' }).click();
  await panel.getByRole('button', { name: 'Confirmar archivo' }).click();
  await expect(page.getByRole('status')).toContainText('Pase archivado');
  await expect(row).toContainText('Archivado');
  await expect(row.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0);
  expect(bodies).toEqual([{ expectedVersion: 2 }]);
});

test('rejects ambiguous pass prices before sending them', async ({ page }) => {
  await mockPassTypes(page, () => [fullPass]);
  let writes = 0;
  await page.route(
    (url) => api(url) && url.pathname === passTypesPath,
    (route) => {
      if (route.request().method() === 'GET') return route.fallback();
      writes++;
      return route.fulfill({ status: 201, json: openStyles });
    },
  );
  await page.goto(passTypesPath);
  await page.getByRole('button', { name: 'Nuevo pase' }).click();
  const form = page.getByRole('form', { name: 'Nuevo pase' });
  await form.getByLabel('Nombre').fill('Pase general');
  for (const price of ['1,500.50', '1.500,50', '1,500', '12.345']) {
    await form.getByLabel('Precio (MXN)').fill(price);
    await form.getByRole('button', { name: 'Guardar' }).click();
    await expect(form.getByRole('alert')).toContainText('separadores de miles');
  }
  expect(writes).toBe(0);
});

test('parses MXN prices with a dot or comma decimal separator', async ({ page }) => {
  const inputs = [
    '1500',
    ' 1500.5 ',
    '1500,50',
    '0,05',
    '21474836,47',
    '21474836,48',
    '1,500.50',
    '1.500,50',
    '1,500',
    '1.500',
    '12.345',
    '1 500',
    ',50',
    '',
  ];
  await page.goto('/');
  // No unit runner exists, so the pure parser is loaded from the Vite dev server in the page.
  const parsed = await page.evaluate(async (values) => {
    const modulePath = '/src/entities/event-catalog/model/money.ts';
    const money = (await import(/* @vite-ignore */ modulePath)) as {
      parseMxnToCents: (value: string) => number | null;
    };
    return values.map((value) => money.parseMxnToCents(value));
  }, inputs);
  expect(Object.fromEntries(inputs.map((input, index) => [input, parsed[index]]))).toEqual({
    '1500': 150000,
    ' 1500.5 ': 150050,
    '1500,50': 150050,
    '0,05': 5,
    '21474836,47': 2147483647,
    '21474836,48': null,
    '1,500.50': null,
    '1.500,50': null,
    '1,500': null,
    '1.500': null,
    '12.345': null,
    '1 500': null,
    ',50': null,
    '': null,
  });
});
