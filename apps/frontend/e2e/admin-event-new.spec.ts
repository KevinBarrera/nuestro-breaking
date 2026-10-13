import { expect, test, type Page, type Route } from '@playwright/test';
import { eventId, mockAdminApi } from './support/admin-mocks.ts';
import { eventAdmin, mockSession } from './support/event-mocks.ts';

// The shared admin mocks plus a session that sends the CSRF token header.
async function mockApi(page: Page) {
  await mockAdminApi(page);
  await mockSession(page);
}

const form = (page: Page) => page.getByRole('form', { name: 'Nuevo evento' });
const preview = (page: Page) => page.getByRole('complementary', { name: 'Vista previa' });
const slugField = (page: Page) =>
  form(page).getByRole('textbox', { name: 'Dirección de la página de compra' });

const created = {
  id: eventId,
  name: 'Los más pesados - Final - Marzo 2027',
  slug: 'final-2027',
  folioPrefix: 'LMPF',
  timeZone: 'America/Mexico_City',
  startsAt: '2027-03-20T16:00:00.000Z',
  endsAt: '2027-03-22T04:00:00.000Z',
  salesEnabled: false,
  archivedAt: null,
};

// Answers `POST /admin/events` with `reply` and records each body; reads fall through.
async function mockCreate(page: Page, reply: (route: Route) => Promise<void>) {
  const bodies: unknown[] = [];
  await page.route(
    (url) => url.port === '3000' && url.pathname === '/admin/events',
    async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      bodies.push(route.request().postDataJSON());
      await reply(route);
    },
  );
  return bodies;
}

async function fillValid(page: Page) {
  await form(page).getByLabel('Nombre del evento').fill('Los más pesados - Final - Marzo 2027');
  await form(page).getByLabel('Prefijo de folio').fill('lmpf');
}

test('a global admin creates an event: suggested address, preview, then the new overview', async ({
  page,
}) => {
  await mockApi(page);
  const bodies = await mockCreate(page, (route) => route.fulfill({ status: 201, json: created }));
  await page.goto('/admin');
  await page.getByRole('main').getByRole('link', { name: 'Crear evento' }).click();
  await expect(page).toHaveURL('/admin/events/new');
  await expect(
    page.getByRole('navigation', { name: 'Ruta de navegación' }).getByRole('link', {
      name: 'Eventos',
    }),
  ).toHaveAttribute('href', '/admin');

  await fillValid(page);
  // The address follows the name until it is edited by hand.
  await expect(slugField(page)).toHaveValue('los-mas-pesados-final-marzo-2027');
  await expect(form(page).getByLabel('Prefijo de folio')).toHaveValue('LMPF');
  const origin = new URL(page.url()).origin;
  await expect(preview(page)).toContainText(`${origin}/e/los-mas-pesados-final-marzo-2027`);
  await expect(preview(page)).toContainText('LMPF-7K3Q');
  await slugField(page).fill('final-2027');
  await form(page).getByLabel('Nombre del evento').fill('Los más pesados - Final - Marzo 2027');
  await expect(slugField(page)).toHaveValue('final-2027');
  await expect(preview(page)).toContainText(`${origin}/e/final-2027`);
  await expect(form(page)).toContainText('El evento se crea con la venta en línea cerrada.');

  await form(page).getByLabel('Inicio').fill('2027-03-20T10:00');
  await form(page).getByLabel('Fin').fill('2027-03-21T22:00');
  await form(page).getByRole('button', { name: 'Crear evento' }).click();
  await expect(page).toHaveURL(`/admin/events/${eventId}`);
  await expect(page.getByRole('heading', { name: 'Resumen del evento' })).toBeVisible();
  expect(bodies).toEqual([
    {
      name: 'Los más pesados - Final - Marzo 2027',
      slug: 'final-2027',
      folioPrefix: 'LMPF',
      timeZone: 'America/Mexico_City',
      startsAt: '2027-03-20T16:00:00.000Z',
      endsAt: '2027-03-22T04:00:00.000Z',
    },
  ]);
});

test('a taken address shows its field error and keeps the form', async ({ page }) => {
  await mockApi(page);
  await mockCreate(page, (route) =>
    route.fulfill({
      status: 409,
      json: { statusCode: 409, code: 'slug_taken', fieldErrors: { slug: 'taken' } },
    }),
  );
  await page.goto('/admin/events/new');
  await fillValid(page);
  await form(page).getByRole('button', { name: 'Crear evento' }).click();
  await expect(slugField(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(slugField(page)).toHaveAccessibleDescription(
    /Esta dirección ya la usa otro evento\. Elige otra\./,
  );
  await expect(slugField(page)).toBeFocused();
  await expect(page).toHaveURL('/admin/events/new');
});

test('an invalid folio prefix is caught before any request', async ({ page }) => {
  await mockApi(page);
  const bodies = await mockCreate(page, (route) => route.fulfill({ status: 201, json: created }));
  await page.goto('/admin/events/new');
  await fillValid(page);
  await form(page).getByLabel('Prefijo de folio').fill('1ab');
  await form(page).getByRole('button', { name: 'Crear evento' }).click();
  const prefix = form(page).getByLabel('Prefijo de folio');
  await expect(prefix).toHaveAttribute('aria-invalid', 'true');
  await expect(prefix).toHaveAccessibleDescription(/empezando con una letra/);
  await expect(prefix).toBeFocused();
  expect(bodies).toEqual([]);
});

test('more than one organization shows a page notice', async ({ page }) => {
  await mockApi(page);
  await mockCreate(page, (route) =>
    route.fulfill({ status: 409, json: { statusCode: 409, code: 'organization_ambiguous' } }),
  );
  await page.goto('/admin/events/new');
  await fillValid(page);
  await form(page).getByRole('button', { name: 'Crear evento' }).click();
  await expect(form(page).getByRole('alert')).toContainText('hay más de una organización');
});

test('leaving with unsaved edits asks first', async ({ page }) => {
  await mockAdminApi(page);
  await page.goto('/admin/events/new');
  await form(page).getByLabel('Nombre del evento').fill('Borrador');
  await form(page).getByRole('link', { name: 'Cancelar' }).click();
  const dialog = page.getByRole('alertdialog', { name: '¿Salir sin guardar?' });
  await dialog.getByRole('button', { name: 'Salir sin guardar' }).click();
  await expect(page).toHaveURL('/admin');
});

test('an event admin cannot create events', async ({ page }) => {
  await mockAdminApi(page);
  await mockSession(page, eventAdmin);
  await page.goto('/admin/events/new');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Sin acceso: solo quien tiene acceso a todos los eventos puede crear eventos.',
  );
  await expect(form(page)).toHaveCount(0);
});

test('on a phone the preview stacks under the form', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await mockAdminApi(page);
  await page.goto('/admin/events/new');
  const formBox = await form(page).boundingBox();
  const previewBox = await preview(page).boundingBox();
  expect(previewBox!.y).toBeGreaterThanOrEqual(formBox!.y + formBox!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
