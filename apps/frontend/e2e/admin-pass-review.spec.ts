import { expect, test, type Page, type Route } from '@playwright/test';
import { chooseOption, expectSelected, selectTrigger } from './support/select.ts';

// Pass writes are protected like activity writes: every save goes through "Revisar cambios",
// archiving asks in a confirmation dialog, and leaving a pass screen with unsaved edits warns.
const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const battleId = 'd1b2c3d4-1234-4567-89ab-123456789abc';
const workshopId = 'd2b2c3d4-1234-4567-89ab-123456789abc';
const fullPassId = 'f1b2c3d4-1234-4567-89ab-123456789abc';
const createdPassId = 'f3b2c3d4-1234-4567-89ab-123456789abc';
const passesPath = `/admin/events/${eventId}/passes`;
const detailPath = `${passesPath}/${fullPassId}`;
const apiPassTypesPath = `/admin/events/${eventId}/pass-types`;
const api = (url: URL) => url.port === '3000';

const activity = (id: string, kind: string, name: string) => ({
  id,
  eventId,
  venueId: 'e1b2c3d4-1234-4567-89ab-123456789abc',
  kind,
  name,
  startsAt: '2026-11-14T16:00:00.000Z',
  endsAt: '2026-11-14T18:00:00.000Z',
  status: 'active',
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
  activities: [{ activityId: battleId, access: 'selectable' }],
};

type Writes = { method: string; path: string; body: Record<string, unknown> }[];

// Mocks the catalog reads and hands every write to `write`, recording it first.
async function mockCatalog(
  page: Page,
  rows: () => unknown[],
  write: (route: Route) => Promise<void> | void = (route) =>
    route.fulfill({ status: 500, json: {} }),
) {
  const writes: Writes = [];
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
          activity(battleId, 'battle', 'Batalla de crews'),
          activity(workshopId, 'workshop', 'Taller de footwork'),
        ],
      }),
  );
  await page.route(
    (url) => api(url) && url.pathname.startsWith(apiPassTypesPath),
    (route) => {
      const request = route.request();
      if (request.method() === 'GET') return route.fulfill({ json: rows() });
      writes.push({
        method: request.method(),
        path: new URL(request.url()).pathname,
        body: request.postDataJSON() as Record<string, unknown>,
      });
      return write(route);
    },
  );
  return writes;
}

const form = (page: Page, name = 'Editar pase') => page.getByRole('form', { name });
const access = (page: Page) => page.getByRole('region', { name: 'Acceso a actividades' });
const review = (page: Page) => page.getByRole('dialog', { name: 'Revisar cambios' });
const leaveDialog = (page: Page) => page.getByRole('alertdialog', { name: '¿Salir sin guardar?' });
const breadcrumb = (page: Page) => page.getByRole('navigation', { name: 'Ruta de navegación' });
const sideNav = (page: Page) => page.getByRole('navigation', { name: 'Navegación administrativa' });

// Each review row reads "<label> <before> cambia a <after>".
async function expectReviewRows(page: Page, rows: [string, string, string][]) {
  const terms = review(page).getByRole('term');
  await expect(terms).toHaveText(rows.map(([label]) => label));
  const values = review(page).getByRole('definition');
  for (const [index, [, before, after]] of rows.entries())
    await expect(values.nth(index)).toHaveText(`${before}→cambia a${after}`);
}

test('a field edit is reviewed before → after and "Volver a editar" keeps the edits', async ({
  page,
}) => {
  let current: Record<string, unknown> = fullPass;
  const writes = await mockCatalog(
    page,
    () => [current],
    (route) => {
      current = { ...fullPass, name: 'Pase VIP', passClass: 'add_on', version: 3 };
      return route.fulfill({ json: { ...current, priceCents: 175050, requiresPassClass: 'full' } });
    },
  );
  await page.goto(detailPath);
  await form(page).getByLabel('Nombre').fill('Pase VIP');
  await form(page).getByRole('radio', { name: 'Adicional' }).check();
  await form(page).getByLabel('Precio (MXN)').fill('1750,50');
  await chooseOption(selectTrigger(form(page), 'Requiere pase'), 'Completo');
  await form(page).getByRole('button', { name: 'Guardar cambios' }).click();

  await expectReviewRows(page, [
    ['Nombre', 'Pase completo', 'Pase VIP'],
    ['Clase', 'Completo', 'Adicional'],
    ['Precio', '$1,500.00', '$1,750.50'],
    ['Requiere pase', 'Ninguno', 'Completo'],
  ]);
  await review(page).getByRole('button', { name: 'Volver a editar' }).click();
  await expect(review(page)).toHaveCount(0);
  await expect(form(page).getByLabel('Nombre')).toHaveValue('Pase VIP');
  await expect(form(page).getByLabel('Precio (MXN)')).toHaveValue('1750,50');
  expect(writes).toHaveLength(0);

  await form(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await review(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('status')).toContainText('Pase actualizado');
  await expect(review(page)).toHaveCount(0);
  expect(writes).toEqual([
    {
      method: 'PATCH',
      path: `${apiPassTypesPath}/${fullPassId}`,
      body: {
        expectedVersion: 2,
        name: 'Pase VIP',
        passClass: 'add_on',
        priceCents: 175050,
        requiresPassClass: 'full',
      },
    },
  ]);
});

test('an unchanged pass cannot be submitted and says why', async ({ page }) => {
  const writes = await mockCatalog(page, () => [fullPass]);
  await page.goto(detailPath);
  const saveFields = form(page).getByRole('button', { name: 'Guardar cambios' });
  await expect(saveFields).toBeEnabled();
  await saveFields.click();
  await expect(form(page).getByRole('alert')).toHaveText('No hay cambios para guardar.');
  const saveAccess = access(page).getByRole('button', { name: 'Guardar acceso' });
  await expect(saveAccess).toBeEnabled();
  await saveAccess.click();
  await expect(access(page).getByRole('alert')).toHaveText('No hay cambios para guardar.');
  await expect(review(page)).toHaveCount(0);
  expect(writes).toHaveLength(0);
});

test('an access edit is reviewed per activity and saved with its expected version', async ({
  page,
}) => {
  let current: Record<string, unknown> = fullPass;
  const writes = await mockCatalog(
    page,
    () => [current],
    (route) => {
      current = {
        ...fullPass,
        version: 3,
        activities: [
          { activityId: battleId, access: 'included' },
          { activityId: workshopId, access: 'selectable' },
        ],
      };
      return route.fulfill({ json: current });
    },
  );
  await page.goto(detailPath);
  await chooseOption(selectTrigger(access(page), 'Acceso a Batalla de crews'), 'Incluida');
  await chooseOption(selectTrigger(access(page), 'Acceso a Taller de footwork'), 'Elegible');
  await access(page).getByRole('button', { name: 'Guardar acceso' }).click();
  await expectReviewRows(page, [
    ['Batalla de crews', 'Elegible', 'Incluida'],
    ['Taller de footwork', 'Sin acceso', 'Elegible'],
  ]);
  await review(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('status')).toContainText('Acceso actualizado');
  expect(writes).toEqual([
    {
      method: 'PUT',
      path: `${apiPassTypesPath}/${fullPassId}/activities`,
      body: {
        expectedVersion: 2,
        activities: [
          { activityId: battleId, access: 'included' },
          { activityId: workshopId, access: 'selectable' },
        ],
      },
    },
  ]);
});

test('a field save keeps unsaved access edits and the next access save sends the new version', async ({
  page,
}) => {
  let current: Record<string, unknown> = fullPass;
  const writes = await mockCatalog(
    page,
    () => [current],
    async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      current =
        route.request().method() === 'PATCH'
          ? { ...current, name: body.name, version: 3 }
          : { ...current, activities: body.activities, version: 4 };
      await route.fulfill({ json: current });
    },
  );
  await page.goto(detailPath);
  await chooseOption(selectTrigger(access(page), 'Acceso a Batalla de crews'), 'Incluida');
  await form(page).getByLabel('Nombre').fill('Pase VIP');
  await form(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await review(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('status')).toContainText('Pase actualizado');
  await expect(form(page)).toContainText('v3');
  await expectSelected(selectTrigger(access(page), 'Acceso a Batalla de crews'), 'Incluida');

  await access(page).getByRole('button', { name: 'Guardar acceso' }).click();
  await review(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('status')).toContainText('Acceso actualizado');
  expect(writes.map(({ method, body }) => [method, body.expectedVersion])).toEqual([
    ['PATCH', 2],
    ['PUT', 3],
  ]);
});

test('a new pass is reviewed with its fields and access before the POST', async ({ page }) => {
  let rows: unknown[] = [fullPass];
  const created = {
    ...fullPass,
    id: createdPassId,
    name: 'Entrada general',
    passClass: 'general',
    priceCents: 30000,
    version: 1,
    activities: [{ activityId: battleId, access: 'included' }],
  };
  const writes = await mockCatalog(
    page,
    () => rows,
    (route) => {
      rows = [...rows, created];
      return route.fulfill({ status: 201, json: created });
    },
  );
  await page.goto(`${passesPath}/new`);
  await form(page, 'Nuevo pase').getByLabel('Nombre').fill('Entrada general');
  await form(page, 'Nuevo pase').getByRole('radio', { name: 'General' }).check();
  await form(page, 'Nuevo pase').getByLabel('Precio (MXN)').fill('300');
  await chooseOption(selectTrigger(access(page), 'Acceso a Batalla de crews'), 'Incluida');
  await form(page, 'Nuevo pase').getByRole('button', { name: 'Guardar' }).click();
  await expectReviewRows(page, [
    ['Nombre', '—', 'Entrada general'],
    ['Clase', '—', 'General'],
    ['Precio', '—', '$300.00'],
    ['Batalla de crews', 'Sin acceso', 'Incluida'],
  ]);
  expect(writes).toHaveLength(0);
  await review(page).getByRole('button', { name: 'Guardar cambios' }).click();
  // A successful create is not an unsaved edit: it lands on the detail without a warning.
  await expect(page).toHaveURL(`${passesPath}/${createdPassId}`);
  await expect(page.getByRole('status')).toContainText('Pase creado');
  await expect(leaveDialog(page)).toHaveCount(0);
  expect(writes).toHaveLength(1);
});

test('archives a pass only from the confirmation dialog, which blocks repeats while pending', async ({
  page,
}) => {
  let current: Record<string, unknown> = fullPass;
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const writes = await mockCatalog(
    page,
    () => [current],
    async (route) => {
      await held;
      current = { ...fullPass, status: 'archived', version: 3 };
      await route.fulfill({ json: current });
    },
  );
  await page.goto(detailPath);
  const archive = form(page).getByRole('button', { name: 'Archivar' });
  await archive.click();
  const confirm = page.getByRole('alertdialog', { name: '¿Archivar Pase completo?' });
  await expect(confirm).toContainText('Ya no se podrá asignar a nuevas inscripciones.');
  await expect(form(page).getByRole('button', { name: 'Confirmar archivo' })).toHaveCount(0);
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(archive).toBeFocused();
  expect(writes).toHaveLength(0);

  await archive.click();
  await confirm.getByRole('button', { name: 'Archivar' }).click();
  await expect(confirm.getByRole('button', { name: 'Archivando…' })).toBeDisabled();
  await expect(confirm.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(confirm).toBeVisible();
  release();
  await expect(page).toHaveURL(passesPath);
  await expect(page.getByRole('status')).toContainText('Pase archivado');
  expect(writes).toEqual([
    {
      method: 'POST',
      path: `${apiPassTypesPath}/${fullPassId}/archive`,
      body: { expectedVersion: 2 },
    },
  ]);
});

test('leaving a pass with unsaved edits asks first; "Salir sin guardar" proceeds', async ({
  page,
}) => {
  await mockCatalog(page, () => [fullPass]);
  await page.goto(detailPath);
  await form(page).getByLabel('Nombre').fill('Pase VIP');
  await breadcrumb(page).getByRole('link', { name: 'Pases' }).click();
  await expect(leaveDialog(page)).toContainText('se perderán');
  await expect(page).toHaveURL(detailPath);
  await leaveDialog(page).getByRole('button', { name: 'Seguir editando' }).click();
  await expect(leaveDialog(page)).toHaveCount(0);
  await expect(form(page).getByLabel('Nombre')).toHaveValue('Pase VIP');

  await sideNav(page).getByRole('link', { name: 'Actividades' }).click();
  await leaveDialog(page).getByRole('button', { name: 'Salir sin guardar' }).click();
  await expect(page).toHaveURL(`/admin/events/${eventId}/activities`);
});

test('unsaved access edits and a dirty create screen also ask before leaving', async ({ page }) => {
  await mockCatalog(page, () => [fullPass]);
  await page.goto(detailPath);
  await chooseOption(selectTrigger(access(page), 'Acceso a Batalla de crews'), 'Incluida');
  await breadcrumb(page).getByRole('link', { name: 'Pases' }).click();
  await leaveDialog(page).getByRole('button', { name: 'Salir sin guardar' }).click();
  await expect(page).toHaveURL(passesPath);

  await page.getByRole('link', { name: 'Nuevo pase' }).click();
  // A clean create screen leaves without asking.
  await form(page, 'Nuevo pase').getByRole('button', { name: 'Cancelar' }).click();
  await expect(page).toHaveURL(passesPath);
  await page.getByRole('link', { name: 'Nuevo pase' }).click();
  await chooseOption(selectTrigger(access(page), 'Acceso a Taller de footwork'), 'Elegible');
  await form(page, 'Nuevo pase').getByRole('button', { name: 'Cancelar' }).click();
  await expect(leaveDialog(page)).toBeVisible();
  await expect(page).toHaveURL(`${passesPath}/new`);
});

test('no warning after a successful save, and reload warns only while dirty', async ({ page }) => {
  let current: Record<string, unknown> = fullPass;
  await mockCatalog(
    page,
    () => [current],
    (route) => {
      current = { ...fullPass, name: 'Pase VIP', version: 3 };
      return route.fulfill({ json: current });
    },
  );
  await page.goto(detailPath);
  // The reload/close prompt is the browser's own; a cancelled beforeunload is what asks for it.
  const unloadCancelled = () =>
    page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
  expect(await unloadCancelled()).toBe(false);
  await form(page).getByLabel('Nombre').fill('Pase VIP');
  await expect.poll(unloadCancelled).toBe(true);

  await form(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await review(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('status')).toContainText('Pase actualizado');
  await expect.poll(unloadCancelled).toBe(false);
  await breadcrumb(page).getByRole('link', { name: 'Pases' }).click();
  await expect(page).toHaveURL(passesPath);
  await expect(leaveDialog(page)).toHaveCount(0);
});

test('stale versions stay visible on both the field and the access save', async ({ page }) => {
  const writes = await mockCatalog(
    page,
    () => [fullPass],
    (route) => route.fulfill({ status: 409, json: { message: 'Pass type version conflict' } }),
  );
  await page.goto(detailPath);
  await form(page).getByLabel('Nombre').fill('Otro pase');
  await form(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await review(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(review(page)).toHaveCount(0);
  await expect(page.getByRole('alert').filter({ hasText: 'Conflicto' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recargar' })).toBeVisible();

  await chooseOption(selectTrigger(access(page), 'Acceso a Batalla de crews'), 'Incluida');
  await access(page).getByRole('button', { name: 'Guardar acceso' }).click();
  await review(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(access(page).getByRole('alert')).toContainText('Otra persona cambió este pase');
  await expect(page.getByText('Pass type version conflict')).toHaveCount(0);
  expect(writes.map((write) => write.method)).toEqual(['PATCH', 'PUT']);
});

test('a save notice stays on its screen and does not come back after leaving it', async ({
  page,
}) => {
  let current: Record<string, unknown> = fullPass;
  await mockCatalog(
    page,
    () => [current],
    (route) => {
      current = { ...fullPass, name: 'Pase VIP', version: 3 };
      return route.fulfill({ json: current });
    },
  );
  await page.goto(detailPath);
  await form(page).getByLabel('Nombre').fill('Pase VIP');
  await form(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await review(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('status')).toContainText('Pase actualizado');
  await breadcrumb(page).getByRole('link', { name: 'Pases' }).click();
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.getByRole('link', { name: 'Editar Pase VIP', exact: true }).click();
  await expect(form(page).getByLabel('Nombre')).toHaveValue('Pase VIP');
  await expect(page.getByRole('status')).toHaveCount(0);
});
