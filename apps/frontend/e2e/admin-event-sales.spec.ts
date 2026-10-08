import { expect, test, type Page, type Route } from '@playwright/test';

// "Venta en línea" on the event overview. Reason copy, date conversion and window validation
// are covered by `sales-model.test.ts`; these specs check the rendered states and the PUT.
const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const overviewPath = `/admin/events/${eventId}`;
const salesPath = `/admin/events/${eventId}/sales`;
const slug = 'los-mas-pesados-nov-2026';
const api = (url: URL) => url.port === '3000';

const closed = {
  slug,
  salesEnabled: false,
  salesOpensAt: null,
  salesClosesAt: null,
  state: 'closed',
  reason: 'disabled',
};

const openWithWindow = {
  slug,
  salesEnabled: true,
  salesOpensAt: '2026-10-01T15:00:00.000Z',
  salesClosesAt: '2026-11-20T06:00:00.000Z',
  state: 'open',
  reason: null,
};

// `put` answers the PUT; the GET always returns `initial`.
async function mockOverview(page: Page, initial: unknown, put?: (route: Route) => unknown) {
  const json = (path: string, body: unknown) =>
    page.route(
      (url) => api(url) && url.pathname === path,
      (route) => route.fulfill({ json: body }),
    );
  await page.route(
    (url) => api(url) && url.pathname === '/auth/session',
    (route) =>
      route.fulfill({
        headers: { 'X-CSRF-Token': 'safe-token', 'Access-Control-Expose-Headers': 'X-CSRF-Token' },
        json: { user: { id: 'admin', roles: ['admin'] } },
      }),
  );
  await json('/admin/events', [{ id: eventId, name: 'Encuentro del barrio' }]);
  await json(`/admin/events/${eventId}/activities`, []);
  await json(`/admin/events/${eventId}/pass-types`, []);
  await json(`/admin/events/${eventId}/foundation`, {
    event: { id: eventId, name: 'Encuentro del barrio', timeZone: 'America/Mexico_City' },
    venues: [],
    activities: [],
    deferredFields: [],
  });
  await page.route(
    (url) => api(url) && url.pathname === salesPath,
    (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: initial });
      if (route.request().method() === 'PUT' && put) return put(route);
      return route.fulfill({ status: 500, json: {} });
    },
  );
}

const section = (page: Page) => page.getByRole('region', { name: 'Venta en línea' });
const form = (page: Page) => page.getByRole('form', { name: 'Configurar venta en línea' });

test('shows closed sales with the reason and the public address', async ({ page }) => {
  await mockOverview(page, closed);
  await page.goto(overviewPath);
  await expect(section(page).getByTestId('sales-status')).toHaveText(
    'CerradaLa venta está apagada',
  );
  await expect(section(page)).toContainText(`/e/${slug}`);
  await expect(section(page)).toContainText(`Identificador: ${slug}`);
  await expect(form(page).getByRole('switch', { name: 'Venta en línea activa' })).not.toBeChecked();
  await expect(form(page).getByLabel('Apertura (opcional)')).toHaveValue('');
  await expect(section(page)).toContainText('Hora del evento (America/Mexico_City)');
});

test('shows open sales with dates on the event clock', async ({ page }) => {
  await mockOverview(page, openWithWindow);
  await page.goto(overviewPath);
  const status = section(page).getByTestId('sales-status');
  await expect(status).toContainText('Abierta');
  await expect(status).toContainText(/Cierra el .*00:00/);
  await expect(form(page).getByRole('switch', { name: 'Venta en línea activa' })).toBeChecked();
  await expect(form(page).getByLabel('Apertura (opcional)')).toHaveValue('2026-10-01T09:00');
  await expect(form(page).getByLabel('Cierre (opcional)')).toHaveValue('2026-11-20T00:00');
});

test('opens sales with a window and sends the full PUT body', async ({ page }) => {
  const bodies: unknown[] = [];
  const tokens: (string | null)[] = [];
  await mockOverview(page, closed, async (route) => {
    bodies.push(route.request().postDataJSON());
    tokens.push(await route.request().headerValue('X-CSRF-Token'));
    await route.fulfill({ json: openWithWindow });
  });
  await page.goto(overviewPath);
  await form(page).getByRole('switch', { name: 'Venta en línea activa' }).check();
  await form(page).getByLabel('Apertura (opcional)').fill('2026-10-01T09:00');
  await form(page).getByLabel('Cierre (opcional)').fill('2026-11-20T00:00');
  await form(page).getByRole('button', { name: 'Guardar' }).click();

  await expect(form(page).getByRole('status')).toHaveText('Venta en línea guardada.');
  expect(bodies).toEqual([
    {
      salesEnabled: true,
      salesOpensAt: '2026-10-01T15:00:00.000Z',
      salesClosesAt: '2026-11-20T06:00:00.000Z',
    },
  ]);
  expect(tokens).toEqual(['safe-token']);
  await expect(section(page).getByTestId('sales-status')).toContainText('Abierta');
});

test('clears a date and sends null for it', async ({ page }) => {
  const bodies: unknown[] = [];
  await mockOverview(page, openWithWindow, async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ json: { ...openWithWindow, salesClosesAt: null } });
  });
  await page.goto(overviewPath);
  await form(page).getByRole('button', { name: 'Quitar fecha de cierre' }).click();
  await expect(form(page).getByLabel('Cierre (opcional)')).toHaveValue('');
  await form(page).getByRole('button', { name: 'Guardar' }).click();
  await expect(form(page).getByRole('status')).toBeVisible();
  expect(bodies).toEqual([
    { salesEnabled: true, salesOpensAt: '2026-10-01T15:00:00.000Z', salesClosesAt: null },
  ]);
  await expect(section(page).getByTestId('sales-status')).toHaveText('Abierta');
});

test('blocks a closing date before the opening without calling the API', async ({ page }) => {
  let puts = 0;
  await mockOverview(page, closed, (route) => {
    puts += 1;
    return route.fulfill({ json: closed });
  });
  await page.goto(overviewPath);
  await form(page).getByLabel('Apertura (opcional)').fill('2026-10-15T09:00');
  const closing = form(page).getByLabel('Cierre (opcional)');
  await closing.fill('2026-10-15T08:00');
  await form(page).getByRole('button', { name: 'Guardar' }).click();
  await expect(closing).toHaveAttribute('aria-invalid', 'true');
  await expect(closing).toHaveAccessibleDescription('El cierre debe ser después de la apertura.');
  await expect(closing).toBeFocused();
  expect(puts).toBe(0);
});

test('shows a safe notice when the server rejects the window', async ({ page }) => {
  await mockOverview(page, closed, (route) =>
    route.fulfill({ status: 400, json: { message: 'private detail' } }),
  );
  await page.goto(overviewPath);
  await form(page).getByLabel('Apertura (opcional)').fill('2026-10-15T09:00');
  await form(page).getByRole('button', { name: 'Guardar' }).click();
  await expect(form(page).getByRole('alert')).toContainText('el servidor rechazó las fechas');
  await expect(page.getByText('private detail')).toHaveCount(0);
  await expect(form(page).getByRole('button', { name: 'Guardar' })).toBeEnabled();
  await expect(section(page).getByTestId('sales-status')).toContainText('Cerrada');
});

test('keeps the catalog summary when sales cannot be read and retries', async ({ page }) => {
  let healthy = false;
  await mockOverview(page, closed);
  await page.route(
    (url) => api(url) && url.pathname === salesPath,
    (route) =>
      healthy ? route.fulfill({ json: closed }) : route.fulfill({ status: 500, json: {} }),
  );
  await page.goto(overviewPath);
  await expect(section(page)).toContainText('No se pudo cargar el estado de la venta.');
  await expect(page.getByRole('region', { name: 'Catálogo' })).toBeVisible();
  await expect(section(page).getByRole('alert')).toHaveCount(0);
  healthy = true;
  await section(page).getByRole('button', { name: 'Reintentar' }).click();
  await expect(section(page).getByTestId('sales-status')).toContainText('Cerrada');
});

test('fits a 375px viewport with 44px controls', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await mockOverview(page, openWithWindow);
  await page.goto(overviewPath);
  await expect(form(page).getByRole('button', { name: 'Guardar' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  for (const control of [
    form(page).getByRole('button', { name: 'Guardar' }),
    form(page).getByRole('button', { name: 'Quitar fecha de apertura' }),
    form(page).getByLabel('Cierre (opcional)'),
  ])
    expect((await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});
