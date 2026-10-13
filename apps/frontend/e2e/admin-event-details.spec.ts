import { expect, test, type Page, type Route } from '@playwright/test';
import { eventAdmin, eventSummary, mockSession } from './support/event-mocks.ts';
import { chooseOption, expectSelected, selectTrigger } from './support/select.ts';

// Datos del evento (#213 T9, formerly "Fundamentos del evento"). Date conversion, dirty
// detection and the changed-field payload are covered by `event-details-model.test.ts`.
const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const venueId = 'e1b2c3d4-1234-4567-89ab-123456789abc';
const detailsPath = `/admin/events/${eventId}/foundation`;
const api = (url: URL) => url.port === '3000';
const foundationEndpoint = (url: URL) => api(url) && url.pathname === detailsPath;
const sessionEndpoint = (url: URL) => api(url) && url.pathname === '/auth/session';
const adminEventsEndpoint = (url: URL) => api(url) && url.pathname === '/admin/events';
const eventEndpoint = (url: URL) => api(url) && url.pathname === `/admin/events/${eventId}`;
const venuesEndpoint = (url: URL) =>
  api(url) && url.pathname.startsWith(`/admin/events/${eventId}/venues`);

const event = {
  id: eventId,
  name: 'Encuentro del barrio',
  slug: 'encuentro-del-barrio',
  folioPrefix: 'EB',
  timeZone: 'America/Mexico_City',
  // 10:00 on the 14th to 20:00 on the 15th, Mexico City time.
  startsAt: '2026-11-14T16:00:00.000Z',
  endsAt: '2026-11-16T02:00:00.000Z',
  salesEnabled: false,
  archivedAt: null as string | null,
};

const foundation = (overrides: Partial<typeof event> = {}, venues = [centro]) => ({
  event: { ...event, ...overrides, windowStatus: 'bounded' },
  venues,
  activities: [],
  deferredFields: [],
});
const centro = { id: venueId, name: 'Centro cultural' };

const main = (page: Page) => page.getByRole('main');
const form = (page: Page) => main(page).getByRole('form', { name: 'Datos del evento' });
const venues = (page: Page) => main(page).getByRole('region', { name: 'Sedes' });
const saveButton = (page: Page) => form(page).getByRole('button', { name: 'Guardar cambios' });

async function openDetails(page: Page, json: unknown = foundation(), session?: unknown) {
  await mockSession(page, session);
  await page.route(adminEventsEndpoint, (route) =>
    route.fulfill({ json: [eventSummary(eventId, event.name)] }),
  );
  await page.route(foundationEndpoint, (route) => route.fulfill({ json }));
  await page.goto(detailsPath);
  await expect(form(page)).toBeVisible();
}

// Records each PATCH body and answers with `reply`.
async function capturePatch(page: Page, reply: (body: Record<string, unknown>) => unknown) {
  const bodies: Record<string, unknown>[] = [];
  const csrf: (string | undefined)[] = [];
  await page.route(eventEndpoint, (route: Route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const body = route.request().postDataJSON() as Record<string, unknown>;
    bodies.push(body);
    csrf.push(route.request().headers()['x-csrf-token']);
    return route.fulfill(reply(body) as Parameters<Route['fulfill']>[0]);
  });
  return { bodies, csrf };
}

test('does not request the event without a valid session', async ({ page }) => {
  let requested = false;
  await page.route(sessionEndpoint, (route) => route.fulfill({ status: 401, json: {} }));
  await page.route(foundationEndpoint, (route) => {
    requested = true;
    return route.fulfill({ json: foundation() });
  });
  await page.goto(detailsPath);
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  expect(requested).toBe(false);
});

test('shows the event data on its own clock, the fixed fields and the venues', async ({ page }) => {
  await openDetails(page);
  await expect(
    main(page).getByRole('heading', { name: 'Datos del evento', level: 1 }),
  ).toBeVisible();
  await expect(form(page).getByLabel('Nombre del evento')).toHaveValue('Encuentro del barrio');
  await expectSelected(
    selectTrigger(form(page), 'Zona horaria'),
    'Ciudad de México (America/Mexico_City)',
  );
  await expect(form(page).getByLabel('Inicio')).toHaveValue('2026-11-14T10:00');
  await expect(form(page).getByLabel('Fin')).toHaveValue('2026-11-15T20:00');
  const locked = form(page).getByRole('region', { name: 'Fijos desde la creación' });
  await expect(locked).toContainText('/e/encuentro-del-barrio');
  await expect(locked).toContainText('EB');
  await expect(locked).toContainText('los folios emitidos usan este prefijo');
  // Nothing changed yet.
  await expect(saveButton(page)).toBeDisabled();
  await expect(form(page).getByRole('button', { name: 'Descartar cambios' })).toBeDisabled();
  await expect(venues(page).getByRole('listitem')).toHaveText([/^Centro cultural/]);
  const header = page.getByRole('banner', { name: 'Espacio de administración' });
  await expect(header.getByText('Datos del evento')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Navegación administrativa' });
  await expect(nav.getByRole('link', { name: 'Datos del evento' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('saves only the changed fields and shows the saved values', async ({ page }) => {
  await openDetails(page);
  const patch = await capturePatch(page, (body) => ({ json: { ...event, ...body } }));
  await form(page).getByLabel('Nombre del evento').fill('  Encuentro del barrio 2026 ');
  await form(page).getByLabel('Fin').fill('2026-11-15T22:00');
  await saveButton(page).click();
  await expect(
    main(page).getByRole('status').filter({ hasText: 'Cambios guardados.' }),
  ).toBeVisible();
  expect(patch.bodies).toEqual([
    { name: 'Encuentro del barrio 2026', endsAt: '2026-11-16T04:00:00.000Z' },
  ]);
  expect(patch.csrf).toEqual(['csrf-token']);
  await expect(form(page).getByLabel('Nombre del evento')).toHaveValue('Encuentro del barrio 2026');
  await expect(form(page).getByLabel('Fin')).toHaveValue('2026-11-15T22:00');
  await expect(saveButton(page)).toBeDisabled();
});

test('changing the zone keeps the typed times and sends the new instants', async ({ page }) => {
  await openDetails(page);
  const patch = await capturePatch(page, (body) => ({ json: { ...event, ...body } }));
  await chooseOption(selectTrigger(form(page), 'Zona horaria'), 'Tijuana (America/Tijuana)');
  await expect(form(page)).toContainText('En la hora de Tijuana.');
  await saveButton(page).click();
  await expect(main(page).getByText('Cambios guardados.')).toBeVisible();
  expect(patch.bodies).toEqual([
    {
      timeZone: 'America/Tijuana',
      startsAt: '2026-11-14T18:00:00.000Z',
      endsAt: '2026-11-16T04:00:00.000Z',
    },
  ]);
});

test('a validation error is shown on the field and nothing is sent', async ({ page }) => {
  await openDetails(page);
  const patch = await capturePatch(page, () => ({ json: event }));
  const name = form(page).getByLabel('Nombre del evento');
  await name.fill('');
  await form(page).getByLabel('Inicio').fill('');
  await saveButton(page).click();
  await expect(form(page)).toContainText('Escribe el nombre del evento.');
  await expect(form(page)).toContainText('Escribe también la fecha de inicio.');
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  expect(patch.bodies).toEqual([]);
});

test('a server field error is mapped to its field', async ({ page }) => {
  await openDetails(page);
  await capturePatch(page, () => ({
    status: 400,
    json: { message: 'Invalid event', fieldErrors: { endsAt: 'invalid' } },
  }));
  await form(page).getByLabel('Fin').fill('2026-11-15T21:00');
  await saveButton(page).click();
  await expect(form(page)).toContainText('Revisa la fecha de fin: debe ser después del inicio.');
  await expect(form(page).getByRole('alert')).toContainText('Revisa los datos');
  await expect(form(page).getByLabel('Fin')).toBeFocused();
});

test('Descartar cambios brings back the stored values', async ({ page }) => {
  await openDetails(page);
  const name = form(page).getByLabel('Nombre del evento');
  await name.fill('Otro nombre');
  await expect(saveButton(page)).toBeEnabled();
  await form(page).getByRole('button', { name: 'Descartar cambios' }).click();
  await expect(name).toHaveValue('Encuentro del barrio');
  await expect(saveButton(page)).toBeDisabled();
});

test('unsaved edits ask before leaving the page', async ({ page }) => {
  await openDetails(page);
  await form(page).getByLabel('Nombre del evento').fill('Otro nombre');
  await page
    .getByRole('navigation', { name: 'Navegación administrativa' })
    .getByRole('link', { name: 'Pases' })
    .click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${detailsPath}$`));
});

test('an admin scoped to the event can edit it', async ({ page }) => {
  await openDetails(page, foundation(), eventAdmin);
  const patch = await capturePatch(page, (body) => ({ json: { ...event, ...body } }));
  await form(page).getByLabel('Nombre del evento').fill('Encuentro de Ana');
  await saveButton(page).click();
  await expect(main(page).getByText('Cambios guardados.')).toBeVisible();
  expect(patch.bodies).toEqual([{ name: 'Encuentro de Ana' }]);
  await expect(venues(page).getByRole('button', { name: 'Agregar sede' })).toBeVisible();
});

test('a judge sees the data read-only', async ({ page }) => {
  await openDetails(page, foundation(), {
    user: { id: 'judge', displayName: 'Juez', roles: ['judge'], globalAdmin: false },
  });
  await expect(main(page)).toContainText('Solo lectura');
  await expect(form(page).getByLabel('Nombre del evento')).toHaveAttribute('readonly');
  await expect(form(page).getByRole('button')).toHaveCount(1); // the zone select only
  await expect(selectTrigger(form(page), 'Zona horaria')).toBeDisabled();
  await expect(venues(page).getByRole('button')).toHaveCount(0);
  await expect(venues(page)).toContainText('Centro cultural');
});

test('an archived event says so and cannot be edited', async ({ page }) => {
  await openDetails(page, foundation({ archivedAt: '2026-10-01T12:00:00.000Z' }));
  await expect(main(page)).toContainText('Este evento está archivado');
  await expect(form(page).getByLabel('Nombre del evento')).toHaveAttribute('readonly');
  await expect(saveButton(page)).toHaveCount(0);
  await expect(venues(page).getByRole('button')).toHaveCount(0);
});

test('a save refused because the event was archived meanwhile locks the form', async ({ page }) => {
  await openDetails(page);
  await capturePatch(page, () => ({
    status: 409,
    json: { code: 'event_archived', message: 'Event is archived' },
  }));
  await form(page).getByLabel('Nombre del evento').fill('Otro nombre');
  await saveButton(page).click();
  await expect(main(page)).toContainText('Este evento está archivado');
  await expect(saveButton(page)).toHaveCount(0);
  await expect(venues(page).getByRole('button', { name: 'Agregar sede' })).toHaveCount(0);
});

test('adds a venue and renames one', async ({ page }) => {
  await openDetails(page);
  const writes: { method: string; path: string; body: unknown }[] = [];
  await page.route(venuesEndpoint, (route) => {
    const request = route.request();
    const body = request.postDataJSON() as { name: string };
    writes.push({ method: request.method(), path: new URL(request.url()).pathname, body });
    return request.method() === 'POST'
      ? route.fulfill({
          status: 201,
          json: { id: 'f1b2c3d4-1234-4567-89ab-123456789abc', ...body },
        })
      : route.fulfill({ json: { id: venueId, ...body } });
  });
  const section = venues(page);
  await section.getByRole('button', { name: 'Agregar sede' }).click();
  const addForm = section.getByRole('form', { name: 'Agregar sede' });
  await addForm.getByRole('button', { name: 'Agregar' }).click();
  await expect(addForm).toContainText('Escribe el nombre de la sede.');
  await addForm.getByLabel('Nombre de la sede').fill(' Foro Principal ');
  await addForm.getByRole('button', { name: 'Agregar' }).click();
  await expect(section.getByRole('status')).toContainText('Se agregó la sede «Foro Principal».');
  await expect(section.getByRole('listitem')).toHaveText([/^Centro cultural/, /^Foro Principal/]);

  await section.getByRole('button', { name: 'Renombrar Centro cultural' }).click();
  const renameForm = section.getByRole('form', { name: 'Renombrar Centro cultural' });
  await renameForm.getByLabel('Nombre de la sede').fill('Centro cultural del barrio');
  await renameForm.getByRole('button', { name: 'Guardar nombre' }).click();
  await expect(section.getByRole('status')).toContainText(
    'La sede ahora se llama «Centro cultural del barrio».',
  );
  await expect(section.getByRole('listitem').first()).toContainText('Centro cultural del barrio');
  expect(writes).toEqual([
    { method: 'POST', path: `/admin/events/${eventId}/venues`, body: { name: 'Foro Principal' } },
    {
      method: 'PATCH',
      path: `/admin/events/${eventId}/venues/${venueId}`,
      body: { name: 'Centro cultural del barrio' },
    },
  ]);
});

test('a venue shared with another event explains why it cannot be renamed', async ({ page }) => {
  await openDetails(page);
  await page.route(venuesEndpoint, (route) =>
    route.fulfill({
      status: 409,
      json: { code: 'venue_shared', message: 'Venue is shared with another event' },
    }),
  );
  const section = venues(page);
  await section.getByRole('button', { name: 'Renombrar Centro cultural' }).click();
  const renameForm = section.getByRole('form', { name: 'Renombrar Centro cultural' });
  await renameForm.getByLabel('Nombre de la sede').fill('Otro nombre');
  await renameForm.getByRole('button', { name: 'Guardar nombre' }).click();
  await expect(section.getByRole('alert')).toContainText(
    'Esta sede también la usa otro evento, así que no se puede renombrar desde aquí.',
  );
  await expect(page.getByText('Venue is shared')).toHaveCount(0);
  // The form stays open with the typed name.
  await expect(renameForm.getByLabel('Nombre de la sede')).toHaveValue('Otro nombre');
});

// Holds a route's answer until `release()` is called, to overlap two writes.
function gate() {
  let release = () => {};
  const opened = new Promise<void>((resolve) => (release = resolve));
  return { opened, release };
}

test('a venue added while a save is pending stays after the save answers', async ({ page }) => {
  await openDetails(page);
  const save = gate();
  await page.route(eventEndpoint, async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    await save.opened;
    return route.fulfill({ json: { ...event, name: 'Encuentro 2026' } });
  });
  await page.route(venuesEndpoint, (route) =>
    route.fulfill({
      status: 201,
      json: { id: 'f1b2c3d4-1234-4567-89ab-123456789abc', name: 'Foro Principal' },
    }),
  );
  await form(page).getByLabel('Nombre del evento').fill('Encuentro 2026');
  await saveButton(page).click();
  await expect(form(page).getByRole('button', { name: 'Guardando…' })).toBeVisible();

  const section = venues(page);
  await section.getByRole('button', { name: 'Agregar sede' }).click();
  const addForm = section.getByRole('form', { name: 'Agregar sede' });
  await addForm.getByLabel('Nombre de la sede').fill('Foro Principal');
  await addForm.getByRole('button', { name: 'Agregar' }).click();
  await expect(section.getByRole('listitem')).toHaveText([/^Centro cultural/, /^Foro Principal/]);

  save.release();
  await expect(main(page).getByText('Cambios guardados.')).toBeVisible();
  await expect(form(page).getByLabel('Nombre del evento')).toHaveValue('Encuentro 2026');
  await expect(section.getByRole('listitem')).toHaveText([/^Centro cultural/, /^Foro Principal/]);
});

test('switching events while a save is pending opens the other event', async ({ page }) => {
  const otherId = 'b1b2c3d4-1234-4567-89ab-123456789abc';
  const other = { ...event, id: otherId, name: 'Otro evento', slug: 'otro-evento' };
  await mockSession(page);
  await page.route(adminEventsEndpoint, (route) =>
    route.fulfill({
      json: [eventSummary(eventId, event.name), eventSummary(otherId, other.name)],
    }),
  );
  await page.route(foundationEndpoint, (route) => route.fulfill({ json: foundation() }));
  await page.route(
    (url) => api(url) && url.pathname === `/admin/events/${otherId}/foundation`,
    (route) =>
      route.fulfill({
        json: { event: { ...other, windowStatus: 'bounded' }, venues: [], activities: [] },
      }),
  );
  const save = gate();
  await page.route(eventEndpoint, async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    await save.opened;
    return route.fulfill({ json: { ...event, name: 'Encuentro 2026' } });
  });
  await page.goto(detailsPath);
  await form(page).getByLabel('Nombre del evento').fill('Encuentro 2026');
  await saveButton(page).click();
  await expect(form(page).getByRole('button', { name: 'Guardando…' })).toBeVisible();

  const header = page.getByRole('banner', { name: 'Espacio de administración' });
  await chooseOption(selectTrigger(header, 'Evento'), 'Otro evento');
  await expect(page).toHaveURL(new RegExp(`/admin/events/${otherId}/foundation$`));
  await expect(form(page).getByLabel('Nombre del evento')).toHaveValue('Otro evento');

  const answered = page.waitForResponse(
    (response) => response.request().method() === 'PATCH' && eventEndpoint(new URL(response.url())),
  );
  save.release();
  await answered;
  // The late answer belongs to the first event, so this page keeps showing the second one.
  await expect(form(page).getByLabel('Nombre del evento')).toHaveValue('Otro evento');
  await expect(main(page).getByText('Cambios guardados.')).toHaveCount(0);
  await expect(main(page).getByText('Cargando datos del evento…')).toHaveCount(0);
});

test('a venue write refused because the event was archived closes the venue form', async ({
  page,
}) => {
  await openDetails(page);
  await page.route(venuesEndpoint, (route) =>
    route.fulfill({ status: 409, json: { code: 'event_archived', message: 'Event is archived' } }),
  );
  const section = venues(page);
  await section.getByRole('button', { name: 'Agregar sede' }).click();
  const addForm = section.getByRole('form', { name: 'Agregar sede' });
  await addForm.getByLabel('Nombre de la sede').fill('Foro Principal');
  await addForm.getByRole('button', { name: 'Agregar' }).click();
  await expect(main(page)).toContainText('Este evento está archivado');
  await expect(section.getByRole('alert')).toContainText('Restáuralo primero.');
  await expect(addForm).toHaveCount(0);
  await expect(section.getByRole('button')).toHaveCount(0);
  await expect(saveButton(page)).toHaveCount(0);
});

test('an event without venues invites to add the first one', async ({ page }) => {
  await openDetails(page, foundation({}, []));
  await expect(venues(page)).toContainText('Aún no hay sedes.');
});

test('shows a safe failure for a missing event and retries a server error', async ({ page }) => {
  await mockSession(page);
  let status = 404;
  await page.route(foundationEndpoint, (route) =>
    status === 200
      ? route.fulfill({ json: foundation() })
      : route.fulfill({ status, json: { message: 'Private backend detail' } }),
  );
  await page.goto(detailsPath);
  await expect(main(page).getByRole('alert')).toContainText('No encontramos este evento.');
  await expect(page.getByText('Private backend detail')).toHaveCount(0);

  status = 500;
  await page.reload();
  const alert = main(page).getByRole('alert');
  await expect(alert).toContainText('No se pudieron cargar los datos del evento.');
  status = 200;
  await alert.getByRole('button', { name: 'Reintentar' }).click();
  await expect(form(page)).toBeVisible();
});

test('keeps the header and navigation usable at 375px and opens the overview', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openDetails(page);
  const header = page.getByRole('banner', { name: 'Espacio de administración' });
  const selector = selectTrigger(header, 'Evento');
  await expectSelected(selector, 'Encuentro del barrio');
  await expect(header.getByText(eventId)).toHaveCount(0);
  const home = page
    .getByRole('navigation', { name: 'Navegación administrativa' })
    .getByRole('link', { name: 'Resumen' });
  await page.keyboard.press('Tab');
  await expect(
    header.getByRole('link', { name: 'Los más pesados, ir a todos los eventos' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(selector).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(header.getByRole('button', { name: 'Cambiar a tema oscuro' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(header.getByRole('button', { name: 'Cerrar sesión' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page
      .getByRole('navigation', { name: 'Navegación administrativa' })
      .getByRole('link', { name: 'Todos los eventos' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(home).toBeFocused();
  const scrollWidth = await page.evaluate(
    () =>
      (globalThis as unknown as { document: { documentElement: { scrollWidth: number } } }).document
        .documentElement.scrollWidth,
  );
  expect(scrollWidth).toBeLessThanOrEqual(375);
  await expect(home).toHaveAttribute('href', `/admin/events/${eventId}`);
  await home.click();
  await expect(page).toHaveURL(new RegExp(`/admin/events/${eventId}$`));
});
