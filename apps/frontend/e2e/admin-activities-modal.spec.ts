import { expect, test, type Page, type Route } from '@playwright/test';
import { chooseOption, selectTrigger } from './support/select.ts';

// Activity create, edit and archive run in shared dialogs: the form opens in a modal, every
// save goes through "Revisar cambios" and archiving asks in a confirmation dialog.
const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const venueId = 'e1b2c3d4-1234-4567-89ab-123456789abc';
const studioId = 'e2b2c3d4-1234-4567-89ab-123456789abc';
const battleId = 'd1b2c3d4-1234-4567-89ab-123456789abc';
const activitiesPath = `/admin/events/${eventId}/activities`;
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
  kind: 'battle',
  name: 'Batalla de crews',
  startsAt: '2026-11-14T16:00:00.000Z',
  endsAt: '2026-11-14T18:00:00.000Z',
  status: 'active',
  version: 3,
};

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
    (url) => api(url) && url.pathname.startsWith(activitiesPath),
    (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: [battle] });
      if (!write) return route.fulfill({ status: 500, json: {} });
      return write(route);
    },
  );
}

const editButton = (page: Page) =>
  page
    .getByRole('listitem')
    .filter({ hasText: 'Batalla de crews' })
    .getByRole('button', { name: 'Editar' });

test('opens the new activity form in a modal and Esc discards it', async ({ page }) => {
  await mockCatalog(page);
  await page.goto(activitiesPath);
  const trigger = page.getByRole('button', { name: 'Nueva actividad' });
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Nueva actividad' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Panel de la actividad' })).toHaveCount(0);
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

test('an unchanged edit cannot be saved and says why', async ({ page }) => {
  const writes: string[] = [];
  await mockCatalog(page, (route) => {
    writes.push(route.request().method());
    return route.fulfill({ json: battle });
  });
  await page.goto(activitiesPath);
  await editButton(page).click();

  const dialog = page.getByRole('dialog', { name: 'Editar actividad' });
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('No hay cambios para guardar.');
  await expect(page.getByRole('dialog', { name: 'Revisar cambios' })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('reviews an edit as before → after, and "Volver a editar" keeps the edits', async ({
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
  await dialog.getByLabel('Inicio').fill('2026-11-14T11:30');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();

  const review = page.getByRole('dialog', { name: 'Revisar cambios' });
  await expect(review.getByRole('term')).toHaveText(['Sede', 'Inicio']);
  await expect(review.getByRole('definition').first()).toContainText(
    'Centro cultural→cambia aEstudio principal',
  );
  await expect(review.getByRole('definition').nth(1)).toContainText('10:00');
  await expect(review.getByRole('definition').nth(1)).toContainText('11:30');

  await review.getByRole('button', { name: 'Volver a editar' }).click();
  await expect(review).toHaveCount(0);
  await expect(dialog.getByLabel('Inicio')).toHaveValue('2026-11-14T11:30');
  await expect(selectTrigger(dialog, 'Sede')).toHaveText('Estudio principal');
  expect(body).toBeUndefined();

  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await review.getByRole('button', { name: 'Guardar cambios' }).click();
  // While the request runs both buttons are disabled, so it cannot be sent twice.
  await expect(review.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
  await expect(review.getByRole('button', { name: 'Volver a editar' })).toBeDisabled();
  release();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Actividad actualizada');
  expect(body).toEqual({
    expectedVersion: 3,
    name: 'Batalla de crews',
    kind: 'battle',
    venueId: studioId,
    startsAt: '2026-11-14T17:30:00.000Z',
    endsAt: '2026-11-14T18:00:00.000Z',
  });
});

test('reviews a new activity against empty values before creating it', async ({ page }) => {
  await mockCatalog(page, (route) =>
    route.fulfill({ status: 201, json: { ...battle, id: 'new', name: 'Cypher', version: 1 } }),
  );
  await page.goto(activitiesPath);
  await page.getByRole('button', { name: 'Nueva actividad' }).click();

  const dialog = page.getByRole('dialog', { name: 'Nueva actividad' });
  await dialog.getByLabel('Nombre').fill('Cypher');
  await dialog.getByLabel('Tipo').fill('social');
  await dialog.getByLabel('Inicio').fill('2026-11-14T20:00');
  await dialog.getByLabel('Fin').fill('2026-11-14T22:00');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();

  const review = page.getByRole('dialog', { name: 'Revisar cambios' });
  await expect(review.getByRole('term')).toHaveText(['Nombre', 'Tipo', 'Sede', 'Inicio', 'Fin']);
  await expect(review.getByRole('definition').nth(1)).toContainText('—→cambia aSocial');
  await review.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('status')).toContainText('Actividad creada');
});

test('a stale version closes the dialogs and keeps the reload alert visible', async ({ page }) => {
  await mockCatalog(page, (route) =>
    route.fulfill({ status: 409, json: { message: 'Activity version conflict' } }),
  );
  await page.goto(activitiesPath);
  await editButton(page).click();

  const dialog = page.getByRole('dialog', { name: 'Editar actividad' });
  await dialog.getByLabel('Nombre').fill('Otro nombre');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Revisar cambios' })
    .getByRole('button', { name: 'Guardar cambios' })
    .click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Conflicto');
  await expect(page.getByRole('button', { name: 'Recargar' })).toBeVisible();
  await expect(page.getByText('Actividad actualizada')).toHaveCount(0);
});

test('archives only after the confirmation dialog, which blocks repeats while pending', async ({
  page,
}) => {
  const bodies: unknown[] = [];
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await mockCatalog(page, async (route) => {
    bodies.push(route.request().postDataJSON());
    await held;
    await route.fulfill({ json: { ...battle, status: 'archived', version: 4 } });
  });
  await page.goto(activitiesPath);
  const row = page.getByRole('listitem').filter({ hasText: 'Batalla de crews' });

  await row.getByRole('button', { name: 'Archivar' }).click();
  const confirm = page.getByRole('alertdialog', { name: '¿Archivar Batalla de crews?' });
  await expect(confirm).toContainText('Dejará de estar disponible para nuevos pases.');
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Archivar' })).toBeFocused();
  expect(bodies).toEqual([]);

  await row.getByRole('button', { name: 'Archivar' }).click();
  await confirm.getByRole('button', { name: 'Archivar' }).click();
  await expect(confirm.getByRole('button', { name: 'Archivando…' })).toBeDisabled();
  await expect(confirm.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(confirm).toBeVisible();
  release();

  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Actividad archivada');
  expect(bodies).toEqual([{ expectedVersion: 3 }]);
});
