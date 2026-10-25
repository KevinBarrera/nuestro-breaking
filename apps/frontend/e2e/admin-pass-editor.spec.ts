import { expect, test, type Page, type Route } from '@playwright/test';
import { accessControl, chooseAccess, expectAccess } from './support/access.ts';
import { chooseOption, selectTrigger } from './support/select.ts';

// The pass create and edit screens (#373): one draft holds the fields and the access. A new pass
// saves directly with "Crear pase"; an edit shows the "Cambios sin guardar" bar, one review for
// fields and access, and one save (PATCH, then PUT with the version the PATCH returned).
const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const venueId = 'e1b2c3d4-1234-4567-89ab-123456789abc';
const crewsId = 'd1b2c3d4-1234-4567-89ab-123456789abc';
const duoId = 'd2b2c3d4-1234-4567-89ab-123456789abc';
const footworkId = 'd3b2c3d4-1234-4567-89ab-123456789abc';
const toprockId = 'd4b2c3d4-1234-4567-89ab-123456789abc';
const oldWorkshopId = 'd5b2c3d4-1234-4567-89ab-123456789abc';
const fullPassId = 'f1b2c3d4-1234-4567-89ab-123456789abc';
const generalPassId = 'f2b2c3d4-1234-4567-89ab-123456789abc';
const newPassId = 'f4b2c3d4-1234-4567-89ab-123456789abc';
const passesPath = `/admin/events/${eventId}/passes`;
const detailPath = `${passesPath}/${fullPassId}`;
const newPath = `${passesPath}/new`;
const passTypesPath = `/admin/events/${eventId}/pass-types`;
const passPath = `${passTypesPath}/${fullPassId}`;
const accessPath = `${passPath}/activities`;
const api = (url: URL) => url.port === '3000';

type Access = { activityId: string; access: 'selectable' | 'included' };
type Pass = Record<string, unknown> & { version: number; activities: Access[] };

const activity = (id: string, kind: string, name: string, startsAt: string, status = 'active') => ({
  id,
  eventId,
  venueId,
  kind,
  name,
  startsAt,
  endsAt: new Date(Date.parse(startsAt) + 60 * 60 * 1000).toISOString(),
  status,
  version: 1,
});

// Saturday 14 and Sunday 15 November on the event clock (America/Mexico_City, UTC-6).
const activities = [
  activity(duoId, 'competition', 'Batalla 2 vs 2', '2026-11-14T18:00:00.000Z'),
  activity(toprockId, 'workshop', 'Taller de toprock', '2026-11-15T17:00:00.000Z'),
  activity(crewsId, 'competition', 'Batalla de crews', '2026-11-14T16:00:00.000Z'),
  activity(footworkId, 'workshop', 'Taller de footwork', '2026-11-14T17:00:00.000Z'),
  activity(oldWorkshopId, 'workshop', 'Taller viejo', '2026-11-14T15:00:00.000Z', 'archived'),
];

const pass = (
  id: string,
  name: string,
  version: number,
  links: Access[],
  overrides = {},
): Pass => ({
  id,
  eventId,
  name,
  passClass: 'full',
  priceCents: 150000,
  requiresPassClass: null,
  onlineSalesClosesAt: null,
  status: 'active',
  version,
  activities: links,
  ...overrides,
});

const fullPass = pass(fullPassId, 'Pase completo', 2, [
  { activityId: crewsId, access: 'selectable' },
  { activityId: footworkId, access: 'included' },
]);
const generalPass = pass(generalPassId, 'Entrada general', 1, [], { passClass: 'general' });

const foundation = {
  event: {
    id: eventId,
    timeZone: 'America/Mexico_City',
    startsAt: '2026-11-14T15:00:00.000Z',
    endsAt: '2026-11-16T05:00:00.000Z',
  },
  venues: [],
};

// Two confirmed registrations hold the full pass; a pending payment is not sold yet.
const attendeeLists = {
  event: { id: eventId, name: 'Evento' },
  generatedAt: '2026-11-10T12:00:00.000Z',
  passTypes: [],
  activities: [],
  registrations: ['confirmed', 'confirmed', 'pending_payment'].map((status, index) => ({
    registrationId: `r${index}`,
    folio: null,
    fullName: `Persona ${index}`,
    stageName: null,
    status,
    eventCheckedInAt: null,
    passTypeIds: [fullPassId],
    activities: [],
  })),
};

const openSale = {
  slug: 'evento',
  salesEnabled: true,
  salesOpensAt: null,
  salesClosesAt: null,
  state: 'open',
  reason: null,
};

type Write = { method: string; path: string; body: Record<string, unknown> };

type Options = {
  // Answers every write after it is recorded; the default fails it.
  write?: (route: Route, write: Write) => unknown;
  // Overrides the pass list read (for held or failing reloads).
  read?: (route: Route) => unknown;
  // The optional vendidos and sale reads; left unmocked they fail and the UI hides them.
  lists?: unknown;
  sale?: unknown;
};

async function mockCatalog(page: Page, rows: () => unknown[], options: Options = {}) {
  const writes: Write[] = [];
  let passReads = 0;
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
    (url) => api(url) && url.pathname === `/admin/events/${eventId}/activities`,
    (route) => route.fulfill({ json: activities }),
  );
  if (options.lists !== undefined)
    await page.route(
      (url) => api(url) && url.pathname === `/admin/events/${eventId}/attendee-lists`,
      (route) => route.fulfill({ json: options.lists }),
    );
  if (options.sale !== undefined)
    await page.route(
      (url) => api(url) && url.pathname === `/admin/events/${eventId}/sales`,
      (route) => route.fulfill({ json: options.sale }),
    );
  await page.route(
    (url) => api(url) && url.pathname.startsWith(passTypesPath),
    (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        passReads++;
        return options.read ? options.read(route) : route.fulfill({ json: rows() });
      }
      expect(request.headers()['x-csrf-token']).toBe('safe-token');
      const write = {
        method: request.method(),
        path: new URL(request.url()).pathname,
        body: request.postDataJSON() as Record<string, unknown>,
      };
      writes.push(write);
      return options.write ? options.write(route, write) : route.fulfill({ status: 500, json: {} });
    },
  );
  return { writes, passReads: () => passReads };
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const passLink = (page: Page, name: string) =>
  page.getByRole('link', { name: new RegExp(`^${escape(name)},`) });
const editForm = (page: Page) => page.getByRole('form', { name: 'Editar pase' });
const createForm = (page: Page) => page.getByRole('form', { name: 'Nuevo pase' });
const accessList = (page: Page) => page.getByRole('region', { name: 'Acceso a actividades' });
const access = (page: Page, activityName: string) =>
  accessControl(accessList(page), `Acceso a ${activityName}`);
const dayGroup = (page: Page, day: string) =>
  accessList(page).getByRole('group', { name: day, exact: true });
const bar = (page: Page) => page.getByRole('region', { name: 'Cambios sin guardar' });
const createBar = (page: Page) => page.getByRole('region', { name: 'Crear pase' });
const review = (page: Page) => page.getByRole('dialog', { name: 'Revisa los cambios' });
const leaveDialog = (page: Page) => page.getByRole('alertdialog', { name: '¿Salir sin guardar?' });
const breadcrumb = (page: Page) => page.getByRole('navigation', { name: 'Ruta de navegación' });
const sideNav = (page: Page) => page.getByRole('navigation', { name: 'Navegación administrativa' });
const success = (page: Page) => page.getByRole('status').filter({ hasText: 'Guardaste' });

async function openReview(page: Page) {
  await bar(page).getByRole('button', { name: 'Revisar cambios' }).click();
}

async function saveChanges(page: Page) {
  await openReview(page);
  await review(page).getByRole('button', { name: 'Guardar cambios' }).click();
}

// Each review row reads "<label> Antes: <before> Después: <after>".
async function expectReviewRows(page: Page, rows: [string, string, string][]) {
  await expect(review(page).getByRole('term')).toHaveText(rows.map(([label]) => label));
  const values = review(page).getByRole('definition');
  for (const [index, [, before, after]] of rows.entries())
    await expect(values.nth(index)).toHaveText(`Antes: ${before}Después: ${after}`);
}

// No horizontal page scroll, and the access list itself never scrolls sideways.
async function expectNoHorizontalScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
  expect(await accessList(page).evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(
    true,
  );
  const box = (await accessList(page).boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(width);
}

// A successful write answers the pass the server would store, and the next reads return it.
function store(initial: Pass) {
  let current = initial;
  return {
    rows: () => [current, generalPass],
    write: (route: Route, { method, body }: Write) => {
      const { expectedVersion, ...fields } = body;
      current = { ...current, ...fields, version: (expectedVersion as number) + 1 };
      if (method === 'PUT') current = { ...current, activities: body.activities as Access[] };
      return route.fulfill({ json: current });
    },
    set: (next: Pass) => (current = next),
  };
}

test.describe('create', () => {
  test('a new pass starts empty and "Crear pase" saves it with its access in one POST', async ({
    page,
  }) => {
    const rows: unknown[] = [fullPass];
    const created = pass(newPassId, 'Pase batallas', 1, [
      { activityId: crewsId, access: 'included' },
      { activityId: footworkId, access: 'selectable' },
    ]);
    const { writes } = await mockCatalog(page, () => rows, {
      write: (route) => {
        rows.push(created);
        return route.fulfill({ status: 201, json: created });
      },
    });
    await page.goto(passesPath);
    await page.getByRole('link', { name: 'Nuevo pase' }).click();
    await expect(page).toHaveURL(newPath);
    const form = createForm(page);
    await expect(form.getByRole('radio', { name: 'Completo' })).toBeChecked();
    await expect(form.getByRole('radio', { name: 'Mientras el evento venda' })).toBeChecked();
    await expect(selectTrigger(form, 'Requiere pase')).toHaveCount(0);
    await expect(accessList(page)).toContainText('0 incluidas · 0 elegibles de 4');
    await expect(accessList(page).getByRole('heading', { level: 3 })).toHaveText([
      'Sábado 14 de noviembre',
      'Domingo 15 de noviembre',
    ]);
    // Only active activities are listed, and each starts without access.
    await expect(accessList(page)).not.toContainText('Taller viejo');
    for (const name of ['Batalla de crews', 'Batalla 2 vs 2', 'Taller de footwork'])
      await expectAccess(access(page, name), 'Sin acceso');
    await expect(createBar(page)).toContainText('El pase queda en venta al crearlo.');
    await expect(page.getByText(/^v\d+$/)).toHaveCount(0);

    await form.getByLabel('Nombre').fill('Pase batallas');
    await form.getByLabel('Precio').fill('900');
    await chooseAccess(access(page, 'Batalla de crews'), 'Incluida');
    await chooseAccess(access(page, 'Taller de footwork'), 'Elegible');
    await expect(accessList(page)).toContainText('1 incluida · 1 elegible de 4');
    const preview = page.getByRole('complementary', { name: 'Así se ve en la página de compra' });
    await expect(preview).toContainText('Pase batallas');
    await expect(preview).toContainText('$900.00');
    await expect(preview).toContainText('IncluyeBatalla de crews');
    await createBar(page).getByRole('button', { name: 'Crear pase' }).click();

    // No review: the POST goes out at once and the new pass opens without a leave prompt.
    await expect(page).toHaveURL(`${passesPath}/${newPassId}`);
    await expect(page.getByRole('status').filter({ hasText: 'Creaste' })).toHaveText(
      'Creaste Pase batallas. Ya está en venta.',
    );
    await expect(leaveDialog(page)).toHaveCount(0);
    await expect(editForm(page).getByLabel('Nombre')).toHaveValue('Pase batallas');
    await expectAccess(access(page, 'Batalla de crews'), 'Incluida');
    await expect(bar(page)).toHaveCount(0);
    expect(writes).toEqual([
      {
        method: 'POST',
        path: passTypesPath,
        body: {
          name: 'Pase batallas',
          passClass: 'full',
          priceCents: 90000,
          requiresPassClass: null,
          onlineSalesClosesAt: null,
          activities: [
            { activityId: crewsId, access: 'included' },
            { activityId: footworkId, access: 'selectable' },
          ],
        },
      },
    ]);
  });

  test('an invalid new pass says what to fix and sends nothing', async ({ page }) => {
    const { writes } = await mockCatalog(page, () => [fullPass]);
    await page.goto(newPath);
    const form = createForm(page);
    await createBar(page).getByRole('button', { name: 'Crear pase' }).click();
    await expect(form).toContainText('Escribe el nombre del pase.');
    await expect(form).toContainText('Escribe el precio. Usa 0 si es sin costo.');
    await expect(form.getByLabel('Nombre')).toBeFocused();

    await form.getByLabel('Nombre').fill('Preventa');
    await form.getByLabel('Precio').fill('0');
    await form.getByRole('radio', { name: 'Hasta una fecha' }).check();
    await form.getByRole('textbox', { name: 'Hora', exact: true }).fill('9');
    await createBar(page).getByRole('button', { name: 'Crear pase' }).click();
    await expect(form).toContainText('Elige el día y escribe la hora, por ejemplo 23:59.');
    await expect(form).not.toContainText('Escribe el nombre del pase.');
    expect(writes).toHaveLength(0);
  });

  test('a close date from "Atajos" is sent on the event clock', async ({ page }) => {
    const created = pass(newPassId, 'Preventa', 1, [], {
      onlineSalesClosesAt: '2026-11-14T05:59:00.000Z',
    });
    const rows: unknown[] = [fullPass];
    const { writes } = await mockCatalog(page, () => rows, {
      write: (route) => {
        rows.push(created);
        return route.fulfill({ status: 201, json: created });
      },
    });
    await page.goto(newPath);
    const form = createForm(page);
    await form.getByLabel('Nombre').fill('Preventa');
    await form.getByLabel('Precio').fill('500');
    await form.getByRole('radio', { name: 'Hasta una fecha' }).check();
    const presets = form.getByRole('group', { name: 'Atajos' });
    await presets.getByRole('button', { name: 'Al empezar el evento' }).click();
    await expect(form.getByLabel('Día', { exact: true })).toHaveValue('2026-11-14');
    await expect(form.getByRole('textbox', { name: 'Hora', exact: true })).toHaveValue('09:00');
    await presets.getByRole('button', { name: 'Un día antes del evento' }).click();
    await expect(presets.getByRole('button', { name: 'Un día antes del evento' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(form.getByLabel('Día', { exact: true })).toHaveValue('2026-11-13');
    await expect(form.getByRole('textbox', { name: 'Hora', exact: true })).toHaveValue('23:59');
    await createBar(page).getByRole('button', { name: 'Crear pase' }).click();
    await expect(page).toHaveURL(`${passesPath}/${newPassId}`);
    expect(writes.map((write) => write.body.onlineSalesClosesAt)).toEqual([
      '2026-11-14T05:59:00.000Z',
    ]);
  });

  test('a new pass whose access names an unavailable activity shows why it failed', async ({
    page,
  }) => {
    const { writes } = await mockCatalog(page, () => [fullPass], {
      write: (route) => route.fulfill({ status: 400, json: { message: 'Invalid activity' } }),
    });
    await page.goto(newPath);
    await createForm(page).getByLabel('Nombre').fill('Pase batallas');
    await createForm(page).getByLabel('Precio').fill('900');
    await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Elegible');
    await createBar(page).getByRole('button', { name: 'Crear pase' }).click();
    const failure = page.getByRole('alert').filter({ hasText: 'No se pudo crear el pase' });
    await expect(failure).toContainText('ya no esté activa');
    await expect(failure.getByRole('button', { name: 'Recargar' })).toBeVisible();
    await expect(page.getByText('Invalid activity')).toHaveCount(0);
    // The specific message only follows a POST that carried access.
    expect(writes.map((write) => write.body.activities)).toEqual([
      [{ activityId: duoId, access: 'selectable' }],
    ]);
    await expect(page).toHaveURL(newPath);
    await expectAccess(access(page, 'Batalla 2 vs 2'), 'Elegible');
  });

  test('a 400 on a new pass without access keeps the generic invalid message', async ({ page }) => {
    const { writes } = await mockCatalog(page, () => [fullPass], {
      write: (route) => route.fulfill({ status: 400, json: { message: 'Bad name' } }),
    });
    await page.goto(newPath);
    await createForm(page).getByLabel('Nombre').fill('Pase batallas');
    await createForm(page).getByLabel('Precio').fill('900');
    await createBar(page).getByRole('button', { name: 'Crear pase' }).click();
    await expect(page.getByRole('alert')).toContainText('Datos inválidos');
    await expect(page.getByText('ya no esté activa')).toHaveCount(0);
    expect(writes.map((write) => write.body.activities)).toEqual([[]]);
    await expect(page).toHaveURL(newPath);
  });

  test('the access list searches, filters and sets a whole day at once', async ({ page }) => {
    await mockCatalog(page, () => [fullPass]);
    await page.goto(newPath);
    await expect(accessList(page)).toContainText(
      'Un pase completo sin actividades no da acceso a ninguna competencia.',
    );
    const saturday = dayGroup(page, 'Sábado 14 de noviembre');
    await saturday.getByRole('button', { name: 'Todas elegibles' }).click();
    for (const name of ['Batalla de crews', 'Taller de footwork', 'Batalla 2 vs 2'])
      await expectAccess(access(page, name), 'Elegible');
    // Other days keep their choices.
    await expectAccess(access(page, 'Taller de toprock'), 'Sin acceso');
    await expect(accessList(page)).toContainText('0 incluidas · 3 elegibles de 4');
    await expect(accessList(page)).not.toContainText('no da acceso a ninguna competencia');

    const onlyWithAccess = accessList(page).getByRole('button', { name: 'Solo con acceso' });
    await onlyWithAccess.click();
    await expect(onlyWithAccess).toHaveAttribute('aria-pressed', 'true');
    await expect(dayGroup(page, 'Domingo 15 de noviembre')).toHaveCount(0);
    await expect(access(page, 'Batalla 2 vs 2')).toBeVisible();
    await saturday.getByRole('button', { name: 'Quitar acceso' }).click();
    await expect(accessList(page)).toContainText(
      'Este pase todavía no da acceso a ninguna actividad.',
    );
    await onlyWithAccess.click();

    const search = accessList(page).getByRole('searchbox', { name: 'Buscar actividad' });
    await search.fill('TOPROCK');
    await expect(accessList(page).getByRole('radiogroup')).toHaveCount(1);
    await expect(access(page, 'Taller de toprock')).toBeVisible();
    await search.fill('salsa');
    await expect(accessList(page)).toContainText('Ninguna actividad coincide con la búsqueda.');
  });

  test('a new pass places the preview beside the form and stacks it at phone width', async ({
    page,
  }) => {
    // The editor's own width decides the two columns; 1440 leaves room beside the sidebar.
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockCatalog(page, () => [fullPass]);
    await page.goto(newPath);
    const preview = page.getByRole('complementary', { name: 'Así se ve en la página de compra' });
    const fields = page.getByRole('region', { name: 'Datos del pase' });
    let left = (await fields.boundingBox())!;
    let right = (await preview.boundingBox())!;
    expect(right.x).toBeGreaterThan(left.x + left.width);

    await page.setViewportSize({ width: 375, height: 800 });
    left = (await fields.boundingBox())!;
    right = (await preview.boundingBox())!;
    expect(right.y).toBeGreaterThan(left.y);
    await expectNoHorizontalScroll(page, 375);
  });

  test('the create bar spans the content column and rests on its bottom edge', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 700 });
    await mockCatalog(page, () => [fullPass]);
    await page.goto(newPath);
    const main = (await page.getByRole('main').boundingBox())!;
    const box = async () => (await createBar(page).boundingBox())!;
    expect((await box()).x).toBeCloseTo(main.x, 0);
    expect((await box()).width).toBeCloseTo(main.width, 0);
    expect((await box()).y + (await box()).height).toBeCloseTo(700, 0);

    // At the end of the page the bar stays flush with the bottom, with no gap under it.
    await createBar(page).evaluate((node) => node.closest('main')?.parentElement?.scrollTo(0, 1e6));
    await expect.poll(async () => Math.round((await box()).y + (await box()).height)).toBe(700);
  });
});

test.describe('edit', () => {
  test('an unchanged pass shows its sale pill and vendidos, no version and no bar', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-11-10T12:00:00.000Z'));
    await mockCatalog(page, () => [fullPass, generalPass], {
      lists: attendeeLists,
      sale: openSale,
    });
    await page.goto(detailPath);
    const header = page.locator('header').filter({ has: page.getByRole('heading', { level: 1 }) });
    await expect(page.getByRole('heading', { name: 'Pase completo', level: 1 })).toBeVisible();
    await expect(header).toContainText('En venta');
    await expect(header).toContainText('2 vendidos');
    await expect(editForm(page).getByLabel('Nombre')).toHaveValue('Pase completo');
    await expect(editForm(page).getByLabel('Precio')).toHaveValue('1500.00');
    await expectAccess(access(page, 'Batalla de crews'), 'Elegible');
    await expectAccess(access(page, 'Taller de footwork'), 'Incluida');
    await expect(page.getByText(/^v\d+$/)).toHaveCount(0);
    await expect(editForm(page)).not.toContainText('v2');
    await expect(bar(page)).toHaveCount(0);
    await expect(createBar(page)).toHaveCount(0);
  });

  test('a pass whose close date passed reads "Venta cerrada"; vendidos hide without the snapshot', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-11-10T12:00:00.000Z'));
    const closed = { ...fullPass, onlineSalesClosesAt: '2026-11-01T05:59:00.000Z' };
    await mockCatalog(page, () => [closed]);
    await page.goto(detailPath);
    await expect(editForm(page)).toBeVisible();
    await expect(page.getByText('Venta cerrada', { exact: true })).toBeVisible();
    await expect(page.getByText(/vendidos?$/)).toHaveCount(0);
    await expect(editForm(page).getByRole('radio', { name: 'Hasta una fecha' })).toBeChecked();
    await expect(editForm(page).getByLabel('Día', { exact: true })).toHaveValue('2026-10-31');
    await expect(editForm(page).getByRole('textbox', { name: 'Hora', exact: true })).toHaveValue(
      '23:59',
    );
  });

  test('any edit shows the unsaved bar with its count, and "Descartar" restores the saved values', async ({
    page,
  }) => {
    const { writes } = await mockCatalog(page, () => [fullPass]);
    await page.goto(detailPath);
    await editForm(page).getByLabel('Nombre').fill('Pase VIP');
    await expect(bar(page)).toContainText('1 cambio sin guardar');
    await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
    await expect(bar(page)).toContainText('2 cambios sin guardar');
    // Going back to the saved value is not a change.
    await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Sin acceso');
    await expect(bar(page)).toContainText('1 cambio sin guardar');
    await chooseAccess(access(page, 'Batalla de crews'), 'Sin acceso');
    await bar(page).getByRole('button', { name: 'Descartar' }).click();
    await expect(bar(page)).toHaveCount(0);
    await expect(editForm(page).getByLabel('Nombre')).toHaveValue('Pase completo');
    await expectAccess(access(page, 'Batalla de crews'), 'Elegible');
    expect(writes).toHaveLength(0);
  });

  test('one review lists fields and access; "Guardar cambios" sends the PATCH, then the PUT with its version', async ({
    page,
  }) => {
    const server = store(fullPass);
    const { writes } = await mockCatalog(page, server.rows, { write: server.write });
    await page.goto(detailPath);
    const form = editForm(page);
    await form.getByLabel('Nombre').fill('Pase VIP');
    await form.getByRole('radio', { name: 'Adicional' }).check();
    await chooseOption(selectTrigger(form, 'Requiere pase'), 'Completo');
    await form.getByLabel('Precio').fill('1750,50');
    await chooseAccess(access(page, 'Batalla de crews'), 'Incluida');
    await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Elegible');
    await expect(bar(page)).toContainText('6 cambios sin guardar');
    await openReview(page);

    await expect(review(page)).toContainText('Pase VIP · se guardan juntos, datos y acceso.');
    await expectReviewRows(page, [
      ['Nombre', 'Pase completo', 'Pase VIP'],
      ['Clase', 'Completo', 'Adicional'],
      ['Precio', '$1,500.00', '$1,750.50'],
      ['Requiere pase', 'Ninguno', 'Completo'],
      ['Batalla de crews', 'Elegible', 'Incluida'],
      ['Batalla 2 vs 2', 'Sin acceso', 'Elegible'],
    ]);
    // Without the vendidos snapshot the price note speaks generally.
    await expect(review(page)).toContainText(
      'Quien ya lo compró conserva el precio que pagó. El nuevo precio aplica a las ventas siguientes.',
    );
    await review(page).getByRole('button', { name: 'Volver a editar' }).click();
    await expect(review(page)).toHaveCount(0);
    await expect(form.getByLabel('Nombre')).toHaveValue('Pase VIP');
    await expectAccess(access(page, 'Batalla 2 vs 2'), 'Elegible');
    expect(writes).toHaveLength(0);

    await saveChanges(page);
    await expect(success(page)).toHaveText('Guardaste los cambios de Pase VIP.');
    await expect(page.getByRole('status').filter({ hasText: 'Guardaste' })).toHaveCount(1);
    await expect(review(page)).toHaveCount(0);
    await expect(bar(page)).toHaveCount(0);
    await expect(form.getByLabel('Nombre')).toHaveValue('Pase VIP');
    await expectAccess(access(page, 'Batalla 2 vs 2'), 'Elegible');
    expect(writes).toEqual([
      {
        method: 'PATCH',
        path: passPath,
        body: {
          expectedVersion: 2,
          name: 'Pase VIP',
          passClass: 'add_on',
          priceCents: 175050,
          requiresPassClass: 'full',
          onlineSalesClosesAt: null,
        },
      },
      {
        method: 'PUT',
        path: accessPath,
        body: {
          expectedVersion: 3,
          activities: [
            { activityId: crewsId, access: 'included' },
            { activityId: footworkId, access: 'included' },
            { activityId: duoId, access: 'selectable' },
          ],
        },
      },
    ]);
  });

  test('the price note counts the buyers when vendidos are known', async ({ page }) => {
    await mockCatalog(page, () => [fullPass], { lists: attendeeLists });
    await page.goto(detailPath);
    await editForm(page).getByLabel('Precio').fill('1600');
    await openReview(page);
    await expect(review(page)).toContainText(
      'Las 2 personas que ya lo compraron conservan el precio que pagaron.',
    );
  });

  test('sets and clears the online sales close date on the event clock (#240)', async ({
    page,
  }) => {
    const server = store(fullPass);
    const { writes } = await mockCatalog(page, server.rows, { write: server.write });
    await page.goto(detailPath);
    const form = editForm(page);
    await form.getByRole('radio', { name: 'Hasta una fecha' }).check();
    await form.getByLabel('Día', { exact: true }).fill('2026-11-17');
    await form.getByRole('textbox', { name: 'Hora', exact: true }).fill('09:00');
    await expect(form).toContainText(
      'Se deja de vender en línea el martes 17 de noviembre a las 09:00.',
    );
    await openReview(page);
    await expectReviewRows(page, [
      ['Venta en línea', 'Mientras el evento venda', 'Hasta el 17 nov 2026, 09:00'],
    ]);
    await review(page).getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(success(page)).toBeVisible();
    await expect(bar(page)).toHaveCount(0);
    await expect(form.getByLabel('Día', { exact: true })).toHaveValue('2026-11-17');

    await form.getByRole('radio', { name: 'Mientras el evento venda' }).check();
    await openReview(page);
    await expectReviewRows(page, [
      ['Venta en línea', 'Hasta el 17 nov 2026, 09:00', 'Mientras el evento venda'],
    ]);
    await review(page).getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(bar(page)).toHaveCount(0);
    // Only the fields changed, so no PUT goes out.
    expect(writes.map((write) => [write.method, write.body.onlineSalesClosesAt])).toEqual([
      ['PATCH', '2026-11-17T15:00:00.000Z'],
      ['PATCH', null],
    ]);
  });

  test('an access PUT failing after the PATCH keeps the access edits for another try', async ({
    page,
  }) => {
    const server = store(fullPass);
    let failPut = true;
    const { writes } = await mockCatalog(page, server.rows, {
      write: (route, write) =>
        write.method === 'PUT' && failPut
          ? route.fulfill({ status: 500, json: {} })
          : server.write(route, write),
    });
    await page.goto(detailPath);
    await editForm(page).getByLabel('Nombre').fill('Pase VIP');
    await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
    await saveChanges(page);
    const failure = page.getByRole('alert').filter({ hasText: 'Se guardaron los datos' });
    await expect(failure).toContainText(
      /^Se guardaron los datos de Pase VIP, pero no el acceso a actividades\./,
    );
    await expect(success(page)).toHaveCount(0);
    // The fields are saved; only the access change is left.
    await expect(editForm(page).getByLabel('Nombre')).toHaveValue('Pase VIP');
    await expectAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
    await expect(bar(page)).toContainText('1 cambio sin guardar');

    failPut = false;
    await openReview(page);
    await expectReviewRows(page, [['Batalla 2 vs 2', 'Sin acceso', 'Incluida']]);
    await review(page).getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(success(page)).toHaveText('Guardaste los cambios de Pase VIP.');
    await expect(bar(page)).toHaveCount(0);
    expect(writes.map(({ method, body }) => [method, body.expectedVersion])).toEqual([
      ['PATCH', 2],
      ['PUT', 3],
      ['PUT', 3],
    ]);
  });

  test('an access PUT conflict after the PATCH asks for a reload instead of another save', async ({
    page,
  }) => {
    const server = store(fullPass);
    await mockCatalog(page, server.rows, {
      write: (route, write) =>
        write.method === 'PUT'
          ? route.fulfill({ status: 409, json: { message: 'Pass type version conflict' } })
          : server.write(route, write),
    });
    await page.goto(detailPath);
    await editForm(page).getByLabel('Nombre').fill('Pase VIP');
    await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
    await saveChanges(page);
    const failure = page.getByRole('alert').filter({ hasText: 'Se guardaron los datos' });
    await expect(failure).toContainText('Conflicto');
    await expect(failure).not.toContainText('vuelve a guardar');
    await expect(failure.getByRole('button', { name: 'Recargar' })).toBeVisible();
  });

  test('a stale PATCH shows the conflict, skips the PUT, and "Recargar" brings the server values', async ({
    page,
  }) => {
    const server = store(fullPass);
    const { writes, passReads } = await mockCatalog(page, server.rows, {
      write: (route) =>
        route.fulfill({ status: 409, json: { message: 'Pass type version conflict' } }),
    });
    await page.goto(detailPath);
    await editForm(page).getByLabel('Nombre').fill('Otro pase');
    await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
    await saveChanges(page);
    await expect(review(page)).toHaveCount(0);
    const conflict = page.getByRole('alert').filter({ hasText: 'Conflicto' });
    await expect(conflict).toBeVisible();
    await expect(page.getByText('Pass type version conflict')).toHaveCount(0);
    await expect(success(page)).toHaveCount(0);
    await expect(bar(page)).toContainText('2 cambios sin guardar');
    expect(writes.map((write) => write.method)).toEqual(['PATCH']);

    // Another writer saved version 5; the reload replaces the stale draft with its values.
    server.set(
      pass(fullPassId, 'Pase completo plus', 5, [{ activityId: crewsId, access: 'included' }]),
    );
    const readsBefore = passReads();
    await conflict.getByRole('button', { name: 'Recargar' }).click();
    await expect.poll(passReads).toBeGreaterThan(readsBefore);
    await expect(editForm(page).getByLabel('Nombre')).toHaveValue('Pase completo plus');
    await expectAccess(access(page, 'Batalla de crews'), 'Incluida');
    await expectAccess(access(page, 'Batalla 2 vs 2'), 'Sin acceso');
    await expect(bar(page)).toHaveCount(0);
    await expect(conflict).toHaveCount(0);
  });

  test('a failed access-only save shows the generic failure and keeps the edit', async ({
    page,
  }) => {
    const { writes } = await mockCatalog(page, () => [fullPass]);
    await page.goto(detailPath);
    await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
    await saveChanges(page);
    await expect(page.getByRole('alert')).toContainText('No se pudo completar la operación');
    await expect(page.getByText('Se guardaron los datos')).toHaveCount(0);
    await expectAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
    await expect(bar(page)).toContainText('1 cambio sin guardar');
    expect(writes.map(({ method, body }) => [method, body.expectedVersion])).toEqual([['PUT', 2]]);
  });

  test('disables the editor and the review while the save is in flight', async ({ page }) => {
    const server = store(fullPass);
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await mockCatalog(page, server.rows, {
      write: async (route, write) => {
        await held;
        await server.write(route, write);
      },
    });
    await page.goto(detailPath);
    await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
    await saveChanges(page);
    // The pending review blocks every repeat until the save settles.
    await expect(review(page).getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    await expect(review(page).getByRole('button', { name: 'Volver a editar' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(review(page)).toBeVisible();
    await expect(accessList(page).getByRole('radio').first()).toBeDisabled();
    release();
    await expect(success(page)).toBeVisible();
    await expect(bar(page)).toHaveCount(0);
    await expect(
      access(page, 'Batalla 2 vs 2').getByRole('radio', { name: 'Incluida' }),
    ).toBeEnabled();
  });

  test('a reload still in flight when a save lands cannot restore the older version', async ({
    page,
  }) => {
    const server = store(fullPass);
    let holdReads = false;
    let heldReads = 0;
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    let staleServed: Promise<unknown> = Promise.resolve();
    let puts = 0;
    const { writes } = await mockCatalog(page, server.rows, {
      read: (route) => {
        if (!holdReads) return route.fulfill({ json: server.rows() });
        heldReads++;
        // The conflict reload reads version 2 now but answers only after the next save lands.
        const snapshot = server.rows();
        staleServed = held.then(() => route.fulfill({ json: snapshot }).catch(() => undefined));
        return staleServed;
      },
      write: (route, write) => {
        if (write.method === 'PUT' && ++puts === 1)
          return route.fulfill({ status: 409, json: { message: 'conflict' } });
        holdReads = false;
        return server.write(route, write);
      },
    });
    await page.goto(detailPath);
    await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
    await saveChanges(page);
    const conflict = page.getByRole('alert').filter({ hasText: 'Conflicto' });
    holdReads = true;
    await conflict.getByRole('button', { name: 'Recargar' }).click();
    await expect.poll(() => heldReads).toBe(1);
    await saveChanges(page);
    await expect(success(page)).toBeVisible();
    release();
    await staleServed;
    // Let the page settle any late response before checking it was ignored.
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
    await expectAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
    await expect(bar(page)).toHaveCount(0);
    // The next save still sends the version the last save returned.
    await editForm(page).getByLabel('Nombre').fill('Pase VIP');
    await saveChanges(page);
    await expect(success(page)).toHaveText('Guardaste los cambios de Pase VIP.');
    expect(writes.map(({ method, body }) => [method, body.expectedVersion])).toEqual([
      ['PUT', 2],
      ['PUT', 2],
      ['PATCH', 3],
    ]);
  });

  test('a save during a retried reload re-reads instead of leaving the refresh failure', async ({
    page,
  }) => {
    const server = store(fullPass);
    let reads: 'ok' | 'fail' | 'hold' = 'ok';
    let heldReads = 0;
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    let heldServed: Promise<unknown> = Promise.resolve();
    let puts = 0;
    const { passReads } = await mockCatalog(page, server.rows, {
      read: (route) => {
        if (reads === 'fail') return route.fulfill({ status: 500, json: {} });
        if (reads === 'ok') return route.fulfill({ json: server.rows() });
        heldReads++;
        const snapshot = server.rows();
        heldServed = held.then(() => route.fulfill({ json: snapshot }).catch(() => undefined));
        return heldServed;
      },
      write: (route, write) =>
        ++puts === 1
          ? route.fulfill({ status: 409, json: { message: 'conflict' } })
          : server.write(route, write),
    });
    await page.goto(detailPath);
    await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
    await saveChanges(page);
    const conflict = page.getByRole('alert').filter({ hasText: 'Conflicto' });
    reads = 'fail';
    await conflict.getByRole('button', { name: 'Recargar' }).click();
    const refreshFailure = page.getByRole('alert').filter({ hasText: 'No se pudo recargar' });
    await expect(refreshFailure).toBeVisible();

    // The retry is still in flight when the next save lands and aborts it.
    reads = 'hold';
    await refreshFailure.getByRole('button', { name: 'Recargar' }).click();
    await expect.poll(() => heldReads).toBe(1);
    reads = 'ok';
    const readsBeforeSave = passReads();
    await saveChanges(page);
    await expect(success(page)).toBeVisible();
    await expect(refreshFailure).toHaveCount(0);
    await expect.poll(passReads).toBe(readsBeforeSave + 1);
    release();
    await heldServed;
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
    await expectAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
    await expect(bar(page)).toHaveCount(0);
  });

  test('a saved link to an archived activity is no change on its own and is dropped on the next access save', async ({
    page,
  }) => {
    const withArchived = pass(fullPassId, 'Pase completo', 2, [
      ...fullPass.activities,
      { activityId: oldWorkshopId, access: 'included' },
    ]);
    const server = store(withArchived);
    const { writes } = await mockCatalog(page, server.rows, { write: server.write });
    await page.goto(detailPath);
    await expect(accessList(page)).toContainText('se quitará al guardar el acceso');
    await expect(accessList(page)).not.toContainText('Taller viejo');
    await expect(bar(page)).toHaveCount(0);
    await editForm(page).getByLabel('Nombre').fill('Pase VIP');
    await saveChanges(page);
    await expect(success(page)).toBeVisible();
    // A field-only save sends no PUT, so the archived link stays.
    expect(writes.map((write) => write.method)).toEqual(['PATCH']);
    await expect(accessList(page)).toContainText('se quitará al guardar el acceso');

    await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Elegible');
    await openReview(page);
    await expectReviewRows(page, [
      ['Batalla 2 vs 2', 'Sin acceso', 'Elegible'],
      ['Taller viejo', 'Incluida', 'Sin acceso'],
    ]);
    await review(page).getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(bar(page)).toHaveCount(0);
    await expect(accessList(page)).not.toContainText('se quitará al guardar');
    expect(writes.at(-1)).toEqual({
      method: 'PUT',
      path: accessPath,
      body: {
        expectedVersion: 3,
        activities: [
          { activityId: crewsId, access: 'selectable' },
          { activityId: footworkId, access: 'included' },
          { activityId: duoId, access: 'selectable' },
        ],
      },
    });
  });

  for (const width of [1280, 375])
    test(`the edit screen fits a ${width}px viewport without horizontal scroll`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await mockCatalog(page, () => [fullPass, generalPass]);
      await page.goto(detailPath);
      await expect(access(page, 'Batalla de crews')).toBeVisible();
      await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
      await expect(bar(page)).toBeVisible();
      await expectNoHorizontalScroll(page, width);
    });
});

test.describe('leaving and archiving', () => {
  test('leaving a pass with unsaved edits asks first; "Salir sin guardar" proceeds', async ({
    page,
  }) => {
    await mockCatalog(page, () => [fullPass]);
    await page.goto(detailPath);
    await chooseAccess(access(page, 'Batalla de crews'), 'Incluida');
    await breadcrumb(page).getByRole('link', { name: 'Pases' }).click();
    await expect(leaveDialog(page)).toContainText('se perderán');
    await expect(page).toHaveURL(detailPath);
    await leaveDialog(page).getByRole('button', { name: 'Seguir editando' }).click();
    await expect(leaveDialog(page)).toHaveCount(0);
    await expectAccess(access(page, 'Batalla de crews'), 'Incluida');

    await sideNav(page).getByRole('link', { name: 'Actividades' }).click();
    await leaveDialog(page).getByRole('button', { name: 'Salir sin guardar' }).click();
    await expect(page).toHaveURL(`/admin/events/${eventId}/activities`);
  });

  test('"Cancelar" on a dirty create screen asks before leaving', async ({ page }) => {
    await mockCatalog(page, () => [fullPass]);
    await page.goto(newPath);
    await chooseAccess(access(page, 'Taller de footwork'), 'Elegible');
    await createBar(page).getByRole('link', { name: 'Cancelar' }).click();
    await expect(leaveDialog(page)).toBeVisible();
    await expect(page).toHaveURL(newPath);
  });

  test('no warning after a successful save, and reload warns only while dirty', async ({
    page,
  }) => {
    const server = store(fullPass);
    await mockCatalog(page, server.rows, { write: server.write });
    await page.goto(detailPath);
    // The reload/close prompt is the browser's own; a cancelled beforeunload is what asks for it.
    const unloadCancelled = () =>
      page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      });
    expect(await unloadCancelled()).toBe(false);
    await editForm(page).getByLabel('Nombre').fill('Pase VIP');
    await chooseAccess(access(page, 'Batalla 2 vs 2'), 'Incluida');
    await expect.poll(unloadCancelled).toBe(true);

    await saveChanges(page);
    await expect(success(page)).toBeVisible();
    await expect.poll(unloadCancelled).toBe(false);
    await breadcrumb(page).getByRole('link', { name: 'Pases' }).click();
    await expect(page).toHaveURL(passesPath);
    await expect(leaveDialog(page)).toHaveCount(0);
  });

  test('a save notice stays on its screen and does not come back after leaving it', async ({
    page,
  }) => {
    const server = store(fullPass);
    await mockCatalog(page, server.rows, { write: server.write });
    await page.goto(detailPath);
    await editForm(page).getByLabel('Nombre').fill('Pase VIP');
    await saveChanges(page);
    await expect(success(page)).toBeVisible();
    await breadcrumb(page).getByRole('link', { name: 'Pases' }).click();
    await expect(success(page)).toHaveCount(0);
    await passLink(page, 'Pase VIP').click();
    await expect(editForm(page).getByLabel('Nombre')).toHaveValue('Pase VIP');
    await expect(success(page)).toHaveCount(0);
  });

  test('archives a pass only from its confirmation, which names the buyers and blocks repeats while pending', async ({
    page,
  }) => {
    let current: Pass = fullPass;
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const { writes } = await mockCatalog(page, () => [current, generalPass], {
      lists: attendeeLists,
      write: async (route) => {
        await held;
        current = { ...fullPass, status: 'archived', version: 3 };
        await route.fulfill({ json: current });
      },
    });
    await page.goto(detailPath);
    const section = page.getByRole('region', { name: 'Archivar pase' });
    await expect(section).toContainText('Quien ya lo compró lo conserva.');
    const archive = section.getByRole('button', { name: 'Archivar pase' });
    await archive.click();
    const confirm = page.getByRole('alertdialog', { name: '¿Archivar Pase completo?' });
    await expect(confirm).toContainText(
      'Ya no se podrá asignar a nuevas inscripciones: deja de venderse en línea y en mesa. Las 2 personas que lo compraron lo conservan.',
    );
    await confirm.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(archive).toBeFocused();
    expect(writes).toHaveLength(0);

    await archive.click();
    await confirm.getByRole('button', { name: 'Archivar', exact: true }).click();
    await expect(confirm.getByRole('button', { name: 'Archivando…' })).toBeDisabled();
    await expect(confirm.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(confirm).toBeVisible();
    release();
    await expect(page).toHaveURL(passesPath);
    await expect(page.getByRole('status').filter({ hasText: 'Archivaste' })).toHaveText(
      'Archivaste Pase completo.',
    );
    await expect(leaveDialog(page)).toHaveCount(0);
    await page.getByRole('tab', { name: /^Archivados/ }).click();
    await expect(page.getByRole('tabpanel')).toContainText('Pase completo');
    expect(writes).toEqual([
      { method: 'POST', path: `${passPath}/archive`, body: { expectedVersion: 2 } },
    ]);
  });

  test('a pass nobody bought archives without a buyers line', async ({ page }) => {
    await mockCatalog(page, () => [generalPass], { lists: attendeeLists });
    await page.goto(`${passesPath}/${generalPassId}`);
    await page
      .getByRole('region', { name: 'Archivar pase' })
      .getByRole('button', { name: 'Archivar pase' })
      .click();
    const confirm = page.getByRole('alertdialog', { name: '¿Archivar Entrada general?' });
    await expect(confirm).toContainText('deja de venderse en línea y en mesa.');
    await expect(confirm).not.toContainText('lo conserva');
  });
});
