import { expect, test, type Page } from '@playwright/test';
import { accessControl, chooseAccess, expectAccess } from './support/access.ts';

const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const venueId = 'e1b2c3d4-1234-4567-89ab-123456789abc';
const crewsId = 'd1b2c3d4-1234-4567-89ab-123456789abc';
const duoId = 'd2b2c3d4-1234-4567-89ab-123456789abc';
const footworkId = 'd3b2c3d4-1234-4567-89ab-123456789abc';
const oldWorkshopId = 'd4b2c3d4-1234-4567-89ab-123456789abc';
const fullPassId = 'f1b2c3d4-1234-4567-89ab-123456789abc';
const generalPassId = 'f2b2c3d4-1234-4567-89ab-123456789abc';
const oldPassId = 'f3b2c3d4-1234-4567-89ab-123456789abc';
const newPassId = 'f4b2c3d4-1234-4567-89ab-123456789abc';
// The API path of the pass catalog; the admin screens live under `passesPath`.
const passTypesPath = `/admin/events/${eventId}/pass-types`;
const passesPath = `/admin/events/${eventId}/passes`;
const accessPath = `${passTypesPath}/${fullPassId}/activities`;
const api = (url: URL) => url.port === '3000';

type Access = { activityId: string; access: 'selectable' | 'included' };

const activity = (id: string, kind: string, name: string, hour: number, status = 'active') => ({
  id,
  eventId,
  venueId,
  kind,
  name,
  startsAt: `2026-11-14T${hour}:00:00.000Z`,
  endsAt: `2026-11-14T${hour + 1}:00:00.000Z`,
  status,
  version: 1,
});

// Battles start in the opposite order of their names, so the list must sort by time first.
const activities = [
  activity(footworkId, 'workshop', 'Taller de footwork', 16),
  activity(duoId, 'battle', 'Batalla 2 vs 2', 18),
  activity(oldWorkshopId, 'workshop', 'Taller viejo', 12, 'archived'),
  activity(crewsId, 'battle', 'Batalla de crews', 16),
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

// Opens a pass's own screen from the list, going back through the breadcrumb when another
// pass is open.
async function selectPass(page: Page, name: string) {
  const back = page
    .getByRole('navigation', { name: 'Ruta de navegación' })
    .getByRole('link', { name: 'Pases' });
  if (await back.count()) await back.click();
  await page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name }) })
    .getByRole('link', { name: `Editar ${name}`, exact: true })
    .click();
}

const list = (page: Page) => page.getByRole('region', { name: 'Acceso a actividades' });
const access = (page: Page, activityName: string) =>
  accessControl(list(page), `Acceso a ${activityName}`);
const group = (page: Page, kind: string) => list(page).getByRole('list', { name: kind });
const review = (page: Page) => page.getByRole('dialog', { name: 'Revisar cambios' });

// Every save goes through "Revisar cambios"; only its "Guardar cambios" writes.
async function confirmReview(page: Page) {
  await review(page).getByRole('button', { name: 'Guardar cambios' }).click();
}

async function saveAccess(page: Page) {
  await list(page).getByRole('button', { name: 'Guardar acceso' }).click();
  await confirmReview(page);
}

// A clean editor has nothing to save: "Guardar acceso" says so instead of opening the review.
async function expectNothingToSave(page: Page) {
  await list(page).getByRole('button', { name: 'Guardar acceso' }).click();
  await expect(list(page).getByRole('alert')).toHaveText('No hay cambios para guardar.');
  await expect(review(page)).toHaveCount(0);
}

// No horizontal page scroll, and the access list itself never scrolls sideways.
async function expectNoHorizontalScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
  expect(await list(page).evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  const right = (await list(page).boundingBox())!;
  expect(right.x + right.width).toBeLessThanOrEqual(width);
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

test('lists the open pass access grouped by kind, by start time then name', async ({ page }) => {
  await mockCatalog(page, () => [fullPass, generalPass, oldPass]);
  await page.goto(passesPath);
  await selectPass(page, 'Pase completo');
  await expect(page.getByRole('form', { name: 'Editar pase' })).toBeVisible();
  // Only the open pass is shown: a vertical list, not a matrix of every pass.
  await expect(list(page).getByRole('table')).toHaveCount(0);
  await expect(list(page)).not.toContainText('Entrada general');
  await expect(list(page).getByRole('heading', { level: 3 })).toHaveText(['Batalla', 'Taller']);
  await expect(group(page, 'Batalla').getByRole('listitem')).toHaveText([
    /^Batalla de crews/,
    /^Batalla 2 vs 2/,
  ]);
  await expect(group(page, 'Taller').getByRole('listitem')).toHaveText([/^Taller de footwork/]);
  await expect(list(page)).not.toContainText('Taller viejo');
  await expectAccess(access(page, 'Batalla de crews'), 'Elegible');
  await expectAccess(access(page, 'Taller de footwork'), 'Incluida');
  await expectAccess(access(page, 'Batalla 2 vs 2'), 'Sin acceso');
  // Each option is a segment whose whole label is the 44px target.
  const box = await access(page, 'Batalla de crews')
    .getByRole('radio', { name: 'Elegible' })
    .boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await selectPass(page, 'Entrada general');
  await expectAccess(access(page, 'Batalla de crews'), 'Sin acceso');
});

test('Guardar acceso reviews only a changed list and explains an unchanged one', async ({
  page,
}) => {
  await mockCatalog(page, () => [fullPass]);
  const bodies = await mockAccessWrite(page, () => ({ status: 200, json: fullPass }));
  await page.goto(passesPath);
  await selectPass(page, 'Pase completo');
  await expectNothingToSave(page);
  await chooseAccess(access(page, 'Batalla de crews'), 'Incluida');
  await expect(list(page).getByRole('alert')).toHaveCount(0);
  await list(page).getByRole('button', { name: 'Guardar acceso' }).click();
  await expect(review(page)).toContainText('Batalla de crews');
  await review(page).getByRole('button', { name: 'Volver a editar' }).click();
  await chooseAccess(access(page, 'Batalla de crews'), 'Elegible');
  await expectNothingToSave(page);
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
  await page.goto(passesPath);
  await selectPass(page, 'Pase completo');
  await expect(list(page)).toContainText('se quitará al guardar');
  await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Elegible');
  await chooseAccess(access(page, 'Taller de footwork'), 'Sin acceso');
  await list(page).getByRole('button', { name: 'Guardar acceso' }).click();
  // The review also lists the link to the archived activity that the save drops.
  await expect(review(page).getByRole('term')).toHaveText([
    'Batalla 2 vs 2',
    'Taller de footwork',
    'Taller viejo',
  ]);
  await confirmReview(page);
  await expect(page.getByRole('status')).toContainText('Acceso actualizado');
  expect(bodies).toEqual([
    {
      expectedVersion: 2,
      activities: [
        { activityId: crewsId, access: 'selectable' },
        { activityId: duoId, access: 'selectable' },
      ],
    },
  ]);
  await expect(page.getByRole('form', { name: 'Editar pase' })).toContainText('v3');
  await expectAccess(access(page, 'Taller de footwork'), 'Sin acceso');
  await expectNothingToSave(page);
  await expect(list(page)).not.toContainText('se quitará al guardar');
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
  await page.goto(passesPath);
  await selectPass(page, 'Pase completo');
  await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
  await saveAccess(page);
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
  await expectAccess(access(page, 'Batalla de crews'), 'Incluida');
  await expectAccess(access(page, 'Batalla 2 vs 2'), 'Sin acceso');
  await expect(page.getByRole('form', { name: 'Editar pase' })).toContainText('v5');
  await expectNothingToSave(page);
  await expect(conflict).toHaveCount(0);
});

test('other access failures show the generic failure notice', async ({ page }) => {
  await mockCatalog(page, () => [fullPass]);
  await mockAccessWrite(page, () => ({ status: 500, json: {} }));
  await page.goto(passesPath);
  await selectPass(page, 'Pase completo');
  await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
  await saveAccess(page);
  await expect(page.getByRole('alert')).toContainText('No se pudo completar la operación');
  await expectAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
});

for (const width of [1280, 375])
  test(`the access list fits a ${width}px viewport without horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockCatalog(page, () => [fullPass, generalPass]);
    await page.goto(passesPath);
    await selectPass(page, 'Pase completo');
    await expect(access(page, 'Batalla de crews')).toBeVisible();
    await expectNoHorizontalScroll(page, width);
  });

test('saving access keeps unsaved pass edits and the next save sends the new version', async ({
  page,
}) => {
  let current = fullPass;
  await mockCatalog(page, () => [current, generalPass]);
  const patches: unknown[] = [];
  await page.route(
    (url) => api(url) && url.pathname.startsWith(`${passTypesPath}/`),
    (route) => {
      const request = route.request();
      const body = request.postDataJSON() as Record<string, unknown>;
      if (request.method() === 'PUT') {
        current = { ...fullPass, version: 3, activities: body.activities as Access[] };
        return route.fulfill({ json: current });
      }
      expect(request.method()).toBe('PATCH');
      expect(new URL(request.url()).pathname).toBe(`${passTypesPath}/${fullPassId}`);
      patches.push(body);
      current = { ...current, name: body.name as string, version: 4 };
      return route.fulfill({ json: current });
    },
  );
  await page.goto(passesPath);
  await selectPass(page, 'Pase completo');
  const form = page.getByRole('form', { name: 'Editar pase' });
  await form.getByLabel('Nombre').fill('Pase completo VIP');
  await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Elegible');
  await saveAccess(page);
  await expect(page.getByRole('status')).toContainText('Acceso actualizado');
  await expect(form).toContainText('v3');
  await expect(form.getByLabel('Nombre')).toHaveValue('Pase completo VIP');
  await form.getByRole('button', { name: 'Guardar cambios' }).click();
  await confirmReview(page);
  await expect(page.getByRole('status')).toContainText('Pase actualizado');
  expect(patches).toEqual([
    {
      expectedVersion: 3,
      name: 'Pase completo VIP',
      passClass: 'full',
      priceCents: 150000,
      requiresPassClass: null,
    },
  ]);
});

test('disables the access list and the review while the save is in flight', async ({ page }) => {
  await mockCatalog(page, () => [fullPass, generalPass]);
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    (url) => api(url) && url.pathname === accessPath,
    async (route) => {
      await held;
      await route.fulfill({ json: { ...fullPass, version: 3 } });
    },
  );
  await page.goto(passesPath);
  await selectPass(page, 'Pase completo');
  await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
  await saveAccess(page);
  // The pending review dialog covers the editor and blocks every repeat until the save settles.
  await expect(review(page).getByRole('button', { name: 'Guardando…' })).toBeDisabled();
  await expect(review(page).getByRole('button', { name: 'Volver a editar' })).toBeDisabled();
  await expect(list(page).getByRole('radio').first()).toBeDisabled();
  release();
  await expect(page.getByRole('status')).toContainText('Acceso actualizado');
  await expectNothingToSave(page);
  await expect(
    access(page, 'Batalla 2 vs 2').getByRole('radio', { name: 'Incluida' }),
  ).toBeEnabled();
});

test('a reload still in flight when access is saved cannot restore the older version', async ({
  page,
}) => {
  let current = fullPass;
  let holdReads = false;
  let heldReads = 0;
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  let staleServed: Promise<unknown> = Promise.resolve();
  await page.route(
    (url) => api(url) && url.pathname === `/admin/events/${eventId}/activities`,
    (route) => route.fulfill({ json: activities }),
  );
  await page.route(
    (url) => api(url) && url.pathname === passTypesPath,
    (route) => {
      if (!holdReads) return route.fulfill({ json: [current, generalPass] });
      heldReads++;
      // The conflict reload reads version 2 now but answers only after the next save lands.
      const snapshot = [current, generalPass];
      staleServed = held.then(() => route.fulfill({ json: snapshot }).catch(() => undefined));
      return staleServed;
    },
  );
  let puts = 0;
  await page.route(
    (url) => api(url) && url.pathname === accessPath,
    (route) => {
      puts++;
      if (puts === 1) return route.fulfill({ status: 409, json: { message: 'conflict' } });
      const body = route.request().postDataJSON() as { activities: Access[] };
      current = { ...fullPass, version: 3, activities: body.activities };
      return route.fulfill({ json: current });
    },
  );
  await page.goto(passesPath);
  await selectPass(page, 'Pase completo');
  await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
  await saveAccess(page);
  const conflict = page.getByRole('alert').filter({ hasText: 'Otra persona cambió este pase' });
  holdReads = true;
  await conflict.getByRole('button', { name: 'Recargar' }).click();
  await expect.poll(() => heldReads).toBe(1);
  await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
  await saveAccess(page);
  await expect(page.getByRole('status')).toContainText('Acceso actualizado');
  const form = page.getByRole('form', { name: 'Editar pase' });
  await expect(form).toContainText('v3');
  release();
  await staleServed;
  // Let the page settle any late response before checking it was ignored.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
  await expect(form).toContainText('v3');
  await expectAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
  await expectNothingToSave(page);
});

test('an access save during a retried reload re-reads instead of leaving the refresh failure', async ({
  page,
}) => {
  let current = fullPass;
  let reads: 'ok' | 'fail' | 'hold' = 'ok';
  let heldReads = 0;
  let passReads = 0;
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  let heldServed: Promise<unknown> = Promise.resolve();
  await page.route(
    (url) => api(url) && url.pathname === `/admin/events/${eventId}/activities`,
    (route) => route.fulfill({ json: activities }),
  );
  await page.route(
    (url) => api(url) && url.pathname === passTypesPath,
    (route) => {
      passReads++;
      if (reads === 'fail') return route.fulfill({ status: 500, json: {} });
      if (reads === 'ok') return route.fulfill({ json: [current, generalPass] });
      heldReads++;
      const snapshot = [current, generalPass];
      heldServed = held.then(() => route.fulfill({ json: snapshot }).catch(() => undefined));
      return heldServed;
    },
  );
  let puts = 0;
  await page.route(
    (url) => api(url) && url.pathname === accessPath,
    (route) => {
      puts++;
      if (puts === 1) return route.fulfill({ status: 409, json: { message: 'conflict' } });
      const body = route.request().postDataJSON() as { activities: Access[] };
      current = { ...fullPass, version: 3, activities: body.activities };
      return route.fulfill({ json: current });
    },
  );
  await page.goto(passesPath);
  await selectPass(page, 'Pase completo');
  await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
  await saveAccess(page);
  const conflict = page.getByRole('alert').filter({ hasText: 'Otra persona cambió este pase' });
  reads = 'fail';
  await conflict.getByRole('button', { name: 'Recargar' }).click();
  const refreshFailure = page.getByRole('alert').filter({ hasText: 'No se pudo recargar' });
  await expect(refreshFailure).toBeVisible();

  // The retry is still in flight when the next save lands and aborts it.
  reads = 'hold';
  await refreshFailure.getByRole('button', { name: 'Recargar' }).click();
  await expect.poll(() => heldReads).toBe(1);
  reads = 'ok';
  const readsBeforeSave = passReads;
  await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
  await saveAccess(page);
  await expect(page.getByRole('status')).toContainText('Acceso actualizado');

  await expect(refreshFailure).toHaveCount(0);
  expect(passReads).toBe(readsBeforeSave + 1);
  const form = page.getByRole('form', { name: 'Editar pase' });
  await expect(form).toContainText('v3');
  release();
  await heldServed;
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
  await expect(form).toContainText('v3');
  await expectAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
});

// Creating a pass sends its access in the same POST; GETs fall through to the catalog mock.
async function mockCreate(
  page: Page,
  respond: (body: unknown) => { status: number; json: unknown },
) {
  const bodies: unknown[] = [];
  await page.route(
    (url) => api(url) && url.pathname === passTypesPath,
    (route) => {
      const request = route.request();
      if (request.method() !== 'POST') return route.fallback();
      expect(request.headers()['x-csrf-token']).toBe('safe-token');
      const body: unknown = request.postDataJSON();
      bodies.push(body);
      return route.fulfill(respond(body));
    },
  );
  return bodies;
}

async function fillNewPass(page: Page) {
  await page.goto(passesPath);
  await page.getByRole('link', { name: 'Nuevo pase' }).click();
  const form = page.getByRole('form', { name: 'Nuevo pase' });
  await form.getByLabel('Nombre').fill('Pase batallas');
  await form.getByLabel('Precio (MXN)').fill('900');
  return form;
}

test('a new pass sets its access in the same single POST', async ({ page }) => {
  const passes: unknown[] = [fullPass];
  await mockCatalog(page, () => passes);
  const created = pass(newPassId, 'Pase batallas', 1, [
    { activityId: crewsId, access: 'included' },
    { activityId: footworkId, access: 'selectable' },
  ]);
  const bodies = await mockCreate(page, () => {
    passes.push(created);
    return { status: 201, json: created };
  });
  const form = await fillNewPass(page);
  // Every listed activity starts without access.
  for (const name of ['Batalla de crews', 'Batalla 2 vs 2', 'Taller de footwork'])
    await expectAccess(access(page, name), 'Sin acceso');
  await chooseAccess(access(page, 'Batalla de crews'), 'Incluida');
  await chooseAccess(access(page, 'Taller de footwork'), 'Elegible');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await confirmReview(page);
  await expect(page.getByRole('status')).toContainText('Pase creado');
  expect(bodies).toEqual([
    {
      name: 'Pase batallas',
      passClass: 'full',
      priceCents: 90000,
      requiresPassClass: null,
      activities: [
        { activityId: crewsId, access: 'included' },
        { activityId: footworkId, access: 'selectable' },
      ],
    },
  ]);
  await expect(page).toHaveURL(`${passesPath}/${newPassId}`);
  await expectAccess(access(page, 'Batalla de crews'), 'Incluida');
});

test('a new pass shows its fields and access side by side, with counts per kind', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockCatalog(page, () => [fullPass]);
  const form = await fillNewPass(page);
  const fields = form.getByRole('heading', { name: 'Datos del pase', level: 2 });
  await expect(fields).toBeVisible();
  await expect(list(page)).toContainText(
    'Todas empiezan sin acceso. Marca qué puede escoger o qué incluye este pase.',
  );
  // From lg up the access card sits to the right of the fields card.
  const left = (await fields.boundingBox())!;
  const right = (await list(page).boundingBox())!;
  expect(right.x).toBeGreaterThan(left.x + left.width);
  const battles = list(page).getByRole('group', { name: 'Batalla', exact: true });
  await expect(battles).toContainText('0 elegibles · 0 incluidas · 2 actividades');
  await chooseAccess(access(page, 'Batalla de crews'), 'Incluida');
  await expect(battles).toContainText('0 elegibles · 1 incluida · 2 actividades');
  await battles.getByRole('button', { name: 'Marcar todas como elegibles' }).click();
  await expect(battles).toContainText('2 elegibles · 0 incluidas · 2 actividades');
  await expectAccess(access(page, 'Batalla 2 vs 2'), 'Elegible');
  // Other kinds keep their choices.
  await expectAccess(access(page, 'Taller de footwork'), 'Sin acceso');
});

test('a new pass stacks its two cards at phone width without horizontal scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await mockCatalog(page, () => [fullPass]);
  await fillNewPass(page);
  const fields = page.getByRole('heading', { name: 'Datos del pase', level: 2 });
  const left = (await fields.boundingBox())!;
  const right = (await list(page).boundingBox())!;
  expect(right.y).toBeGreaterThan(left.y);
  await expectNoHorizontalScroll(page, 375);
});

test('a new pass whose access names an unavailable activity shows why it failed', async ({
  page,
}) => {
  await mockCatalog(page, () => [fullPass]);
  const bodies = await mockCreate(page, () => ({
    status: 400,
    json: { message: 'Invalid activity' },
  }));
  const form = await fillNewPass(page);
  await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Elegible');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await confirmReview(page);
  const failure = page.getByRole('alert').filter({ hasText: 'No se pudo crear el pase' });
  await expect(failure).toContainText('ya no esté activa');
  await expect(failure.getByRole('button', { name: 'Recargar' })).toBeVisible();
  await expect(page.getByText('Invalid activity')).toHaveCount(0);
  // The specific message only follows a POST that carried access.
  expect(bodies).toEqual([
    expect.objectContaining({ activities: [{ activityId: duoId, access: 'selectable' }] }),
  ]);
  await expect(page).toHaveURL(`${passesPath}/new`);
  await expectAccess(access(page, 'Batalla 2 vs 2'), 'Elegible');
});

test('a 400 on a new pass without access keeps the generic invalid message', async ({ page }) => {
  await mockCatalog(page, () => [fullPass]);
  const bodies = await mockCreate(page, () => ({ status: 400, json: { message: 'Bad name' } }));
  const form = await fillNewPass(page);
  await form.getByRole('button', { name: 'Guardar' }).click();
  await confirmReview(page);
  await expect(page.getByRole('alert')).toContainText('Datos inválidos');
  await expect(page.getByText('ya no esté activa')).toHaveCount(0);
  expect(bodies).toEqual([expect.objectContaining({ activities: [] })]);
});
