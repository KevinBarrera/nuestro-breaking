import { expect, test, type Page, type Route } from '@playwright/test';
import { chooseOption, selectTrigger } from './support/select.ts';

// Activity create and edit run in one dialog: "Crear actividad" saves straight from the form,
// and an edit goes through "Revisa los cambios", step 2 of the same dialog.
const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const venueId = 'e1b2c3d4-1234-4567-89ab-123456789abc';
const studioId = 'e2b2c3d4-1234-4567-89ab-123456789abc';
const battleId = 'd1b2c3d4-1234-4567-89ab-123456789abc';
const activitiesPath = `/admin/events/${eventId}/activities`;
const listsPath = `/admin/events/${eventId}/attendee-lists`;
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
  venues: [
    { id: venueId, name: 'Centro cultural' },
    { id: studioId, name: 'Estudio principal' },
  ],
  activities: [],
  deferredFields: [],
};

const battle = {
  id: battleId,
  eventId,
  venueId,
  kind: 'competition',
  name: 'Batalla de crews',
  startsAt: '2026-11-14T16:00:00.000Z',
  endsAt: '2026-11-14T18:00:00.000Z',
  status: 'active',
  version: 3,
};

// A Sunday social in the same venue, at 13:00–14:00 local, for the overlap warning.
const cypher = {
  ...battle,
  id: 'd2b2c3d4-1234-4567-89ab-123456789abc',
  kind: 'social',
  name: 'Cypher abierto',
  startsAt: '2026-11-15T19:00:00.000Z',
  endsAt: '2026-11-15T20:00:00.000Z',
  version: 1,
};

// Two inscritos have access to Batalla de crews, and "Pase completo" includes it.
async function mockCatalog(page: Page, write?: (route: Route) => Promise<void> | void) {
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
    (url) => api(url) && url.pathname === listsPath,
    (route) =>
      route.fulfill({
        json: {
          event: { id: eventId, name: 'Encuentro del barrio' },
          generatedAt: '2026-11-10T12:00:00.000Z',
          passTypes: [],
          activities: [
            { id: battleId, name: battle.name, kind: 'competition', startsAt: battle.startsAt },
          ],
          registrations: ['r1', 'r2'].map((id) => ({
            registrationId: id,
            folio: null,
            fullName: id,
            stageName: null,
            status: 'confirmed',
            eventCheckedInAt: null,
            passTypeIds: [],
            activities: [{ activityId: battleId, checkedInAt: null }],
          })),
        },
      }),
  );
  await page.route(
    (url) => api(url) && url.pathname === passTypesPath,
    (route) =>
      route.fulfill({
        json: [
          {
            id: 'f1b2c3d4-1234-4567-89ab-123456789abc',
            eventId,
            name: 'Pase completo',
            passClass: 'full',
            priceCents: 150000,
            requiresPassClass: null,
            onlineSalesClosesAt: null,
            status: 'active',
            version: 1,
            activities: [{ activityId: battleId, access: 'included' }],
          },
        ],
      }),
  );
  await page.route(
    (url) => api(url) && url.pathname.startsWith(activitiesPath),
    (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: [battle, cypher] });
      if (!write) return route.fulfill({ status: 500, json: {} });
      return write(route);
    },
  );
}

const editButton = (page: Page) => page.getByRole('button', { name: 'Editar Batalla de crews' });

test('opens the new activity form in a modal and Esc discards it', async ({ page }) => {
  await mockCatalog(page);
  await page.goto(activitiesPath);
  const trigger = page.getByRole('button', { name: 'Nueva actividad' });
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Nueva actividad' });
  await expect(dialog).toBeVisible();
  // The days come from the event dates; the first one is chosen.
  await expect(dialog.getByRole('radio', { name: /Sábado/ })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: /Domingo/ })).not.toBeChecked();
  await dialog.getByLabel('Nombre').fill('Borrador');
  await page.keyboard.press('Escape');

  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(
    page.getByRole('dialog', { name: 'Nueva actividad' }).getByLabel('Nombre'),
  ).toHaveValue('');
});

test('"Cancelar" discards an edit and returns focus to its "Editar" button', async ({ page }) => {
  await mockCatalog(page);
  await page.goto(activitiesPath);
  await editButton(page).click();

  const dialog = page.getByRole('dialog', { name: 'Editar actividad' });
  await dialog.getByLabel('Nombre').fill('Otro nombre');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();

  await expect(dialog).toHaveCount(0);
  await expect(editButton(page)).toBeFocused();
  await editButton(page).click();
  await expect(dialog.getByLabel('Nombre')).toHaveValue('Batalla de crews');
});

test('an unchanged edit cannot be reviewed and says so, with no version label', async ({
  page,
}) => {
  await mockCatalog(page);
  await page.goto(activitiesPath);
  await editButton(page).click();

  const dialog = page.getByRole('dialog', { name: 'Editar actividad' });
  await expect(dialog).toContainText('2 personas inscritas. Incluida en Pase completo.');
  await expect(dialog.getByLabel('Empieza')).toHaveValue('10:00');
  await expect(dialog.getByLabel('Termina', { exact: true })).toHaveValue('12:00');
  await expect(dialog).toContainText('Dura 2 h.');
  await expect(dialog).not.toContainText('v3');
  await expect(dialog.getByText('Sin cambios todavía.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Revisar cambios' })).toBeDisabled();

  await dialog.getByLabel('Nombre').fill('Batalla de crews 2');
  await expect(dialog.getByText('Sin cambios todavía.')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Revisar cambios' })).toBeEnabled();
});

test('reviews an edit in the same dialog, and "Volver a editar" keeps the edits', async ({
  page,
}) => {
  let body: Record<string, unknown> | undefined;
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await mockCatalog(page, async (route) => {
    body = route.request().postDataJSON() as Record<string, unknown>;
    await held;
    await route.fulfill({ json: { ...battle, venueId: studioId, version: 4 } });
  });
  await page.goto(activitiesPath);
  await editButton(page).click();

  const dialog = page.getByRole('dialog', { name: 'Editar actividad' });
  await chooseOption(selectTrigger(dialog, 'Sede'), 'Estudio principal');
  await dialog.getByLabel('Empieza').fill('11:30');
  await dialog.getByRole('button', { name: 'Revisar cambios' }).click();

  // Step 2 replaces the form inside the one dialog; nothing is stacked on top.
  const review = page.getByRole('dialog', { name: 'Revisa los cambios' });
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(review).toContainText('Editar actividad · paso 2 de 2');
  await expect(review.getByRole('term')).toHaveText(['Horario', 'Sede']);
  await expect(review.getByRole('definition').first()).toHaveText(
    'Antes: Sáb 14 nov, 10:00–12:00Después: Sáb 14 nov, 11:30–12:00',
  );
  await expect(review.getByRole('definition').nth(1)).toHaveText(
    'Antes: Centro culturalDespués: Estudio principal',
  );
  await expect(review).toContainText(
    '2 personas inscritas tenían el horario y la sede anteriores. Avísales del cambio.',
  );

  await review.getByRole('button', { name: 'Volver a editar' }).click();
  await expect(dialog.getByLabel('Empieza')).toHaveValue('11:30');
  await expect(selectTrigger(dialog, 'Sede')).toHaveText('Estudio principal');
  expect(body).toBeUndefined();

  await dialog.getByRole('button', { name: 'Revisar cambios' }).click();
  await review.getByRole('button', { name: 'Guardar cambios' }).click();
  // While the request runs both buttons are disabled, so it cannot be sent twice.
  await expect(review.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
  await expect(review.getByRole('button', { name: 'Volver a editar' })).toBeDisabled();
  release();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText(
    'Guardaste los cambios de Batalla de crews.',
  );
  // The untouched end keeps the stored instant.
  expect(body).toEqual({
    expectedVersion: 3,
    name: 'Batalla de crews',
    kind: 'competition',
    venueId: studioId,
    startsAt: '2026-11-14T17:30:00.000Z',
    endsAt: '2026-11-14T18:00:00.000Z',
  });
});

test('creates a new activity straight from the form with "Crear actividad"', async ({ page }) => {
  let body: Record<string, unknown> | undefined;
  await mockCatalog(page, (route) => {
    body = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({
      status: 201,
      json: { ...battle, id: 'new', name: 'Cypher', version: 1 },
    });
  });
  await page.goto(activitiesPath);
  await page.getByRole('button', { name: 'Nueva actividad' }).click();

  const dialog = page.getByRole('dialog', { name: 'Nueva actividad' });
  await dialog.getByLabel('Nombre').fill('Cypher');
  await dialog.getByRole('radio', { name: 'Social' }).check();
  await dialog.getByRole('radio', { name: /Domingo/ }).check();
  await dialog.getByLabel('Empieza').fill('20:00');
  await dialog.getByLabel('Termina', { exact: true }).fill('21:30');
  await expect(dialog).toContainText('Dura 1 h 30 min.');
  await dialog.getByRole('button', { name: 'Crear actividad' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText(
    'Creaste Cypher. Agrégala a un pase para que se pueda vender.',
  );
  await expect(page.getByRole('button', { name: 'Deshacer' })).toHaveCount(0);
  expect(body).toEqual({
    name: 'Cypher',
    kind: 'social',
    venueId,
    startsAt: '2026-11-16T02:00:00.000Z',
    endsAt: '2026-11-16T03:30:00.000Z',
  });
});

test('marks missing fields and a wrong time order, sending nothing', async ({ page }) => {
  const writes: string[] = [];
  await mockCatalog(page, (route) => {
    writes.push(route.request().method());
    return route.fulfill({ json: battle });
  });
  await page.goto(activitiesPath);
  await page.getByRole('button', { name: 'Nueva actividad' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva actividad' });

  await dialog.getByRole('button', { name: 'Crear actividad' }).click();
  await expect(dialog.getByText('Escribe el nombre de la actividad.')).toBeVisible();
  await expect(dialog.getByLabel('Nombre')).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByText('Elige un tipo.')).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveText('Escribe a qué hora empieza y termina.');

  await dialog.getByLabel('Empieza').fill('12:00');
  await dialog.getByLabel('Termina', { exact: true }).fill('11:00');
  await expect(dialog.getByRole('alert')).toHaveText('La hora de fin debe ser después del inicio.');
  await expect(dialog.getByLabel('Termina', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  expect(writes).toEqual([]);
});

test('warns about an overlap in the same venue without blocking the save', async ({ page }) => {
  await mockCatalog(page, (route) =>
    route.fulfill({ status: 201, json: { ...cypher, id: 'new', name: 'Locking 2v2' } }),
  );
  await page.goto(activitiesPath);
  await page.getByRole('button', { name: 'Nueva actividad' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva actividad' });

  await dialog.getByLabel('Nombre').fill('Locking 2v2');
  await dialog.getByRole('radio', { name: 'Competencia' }).check();
  await dialog.getByRole('radio', { name: /Domingo/ }).check();
  await dialog.getByLabel('Empieza').fill('13:30');
  await dialog.getByLabel('Termina', { exact: true }).fill('14:30');
  await expect(dialog).toContainText(
    'Se empalma con Cypher abierto (13:00–14:00) en la misma sede. Puedes guardarla así si es a propósito.',
  );
  await dialog.getByLabel('Empieza').fill('14:00');
  await expect(dialog).not.toContainText('Se empalma');
  await dialog.getByLabel('Empieza').fill('13:30');
  await dialog.getByRole('button', { name: 'Crear actividad' }).click();
  await expect(page.getByRole('status')).toContainText('Creaste Locking 2v2.');
});

test('"Termina otro día" saves an activity that crosses midnight', async ({ page }) => {
  let body: Record<string, unknown> | undefined;
  await mockCatalog(page, (route) => {
    body = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({ status: 201, json: { ...cypher, id: 'new', name: 'After' } });
  });
  await page.goto(activitiesPath);
  await page.getByRole('button', { name: 'Nueva actividad' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva actividad' });

  await dialog.getByLabel('Nombre').fill('After');
  await dialog.getByRole('radio', { name: 'Social' }).check();
  await dialog.getByLabel('Empieza').fill('22:00');
  await dialog.getByLabel('Termina', { exact: true }).fill('01:00');
  await expect(dialog.getByRole('alert')).toHaveText('La hora de fin debe ser después del inicio.');
  await dialog.getByRole('checkbox', { name: 'Termina otro día' }).check();
  const endDay = dialog.getByRole('group', { name: 'Día en que termina' });
  await expect(endDay.getByRole('radio', { name: /Domingo/ })).toBeChecked();
  await expect(dialog).toContainText('Dura 3 h.');
  await dialog.getByRole('button', { name: 'Crear actividad' }).click();

  await expect(page.getByRole('status')).toContainText('Creaste After.');
  expect(body).toMatchObject({
    startsAt: '2026-11-15T04:00:00.000Z',
    endsAt: '2026-11-15T07:00:00.000Z',
  });
});

test('a stale version closes the dialog and keeps the reload alert visible', async ({ page }) => {
  await mockCatalog(page, (route) =>
    route.fulfill({ status: 409, json: { message: 'Activity version conflict' } }),
  );
  await page.goto(activitiesPath);
  await editButton(page).click();

  const dialog = page.getByRole('dialog', { name: 'Editar actividad' });
  await dialog.getByLabel('Nombre').fill('Otro nombre');
  await dialog.getByRole('button', { name: 'Revisar cambios' }).click();
  await page
    .getByRole('dialog', { name: 'Revisa los cambios' })
    .getByRole('button', { name: 'Guardar cambios' })
    .click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Conflicto');
  await expect(page.getByRole('button', { name: 'Recargar' })).toBeVisible();
  await expect(page.getByText(/Guardaste los cambios/)).toHaveCount(0);
});
