import { expect, test } from '@playwright/test';

const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const foundationPath = `/admin/events/${eventId}/foundation`;
const foundationEndpoint = (url: URL) => url.port === '3000' && url.pathname === foundationPath;
const sessionEndpoint = (url: URL) => url.port === '3000' && url.pathname === '/auth/session';

test.beforeEach(async ({ page }) => {
  await page.route(sessionEndpoint, (route) =>
    route.fulfill({ json: { user: { id: 'admin-1', displayName: 'Admin', roles: ['admin'] } } }),
  );
});

test('does not request protected foundation without a valid session', async ({ page }) => {
  await page.route(sessionEndpoint, (route) => route.fulfill({ status: 401, json: {} }));
  let requested = false;
  await page.route(foundationEndpoint, (route) => {
    requested = true;
    return route.fulfill({ json: foundation });
  });
  await page.goto(foundationPath);
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByRole('banner', { name: 'Espacio de administración' })).toHaveCount(0);
  expect(requested).toBe(false);
});

const foundation = {
  event: {
    id: eventId,
    name: 'Encuentro del barrio',
    timeZone: 'Europe/Madrid',
    startsAt: '2026-11-14T09:00:00.000Z',
    endsAt: '2026-11-15T19:00:00.000Z',
    windowStatus: 'bounded',
  },
  venues: [{ id: 'venue-1', name: 'Centro cultural' }],
  activities: [
    {
      id: 'activity-1',
      name: 'Batalla de crews',
      kind: 'battle',
      venueId: 'venue-1',
      startsAt: '2026-11-14T10:00:00.000Z',
      endsAt: '2026-11-14T12:00:00.000Z',
      planningStatus: 'draft',
    },
  ],
  deferredFields: ['priceDisplay', 'capacity', 'registrationRequirements'],
};

test('loads the endpoint-backed foundation for the event in the URL', async ({ page }) => {
  let releaseResponse!: () => void;
  const heldResponse = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  let requestedPath: string | undefined;
  await page.addInitScript({
    content: `
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (String(input).includes('/auth/session') || String(input).includes('/foundation')) {
        document.documentElement.dataset.apiCredentials =
          (document.documentElement.dataset.apiCredentials || '') + init?.credentials + ',';
      }
      return originalFetch(input, init);
    };
  `,
  });
  await page.route(foundationEndpoint, async (route) => {
    requestedPath = new URL(route.request().url()).pathname;
    await heldResponse;
    await route.fulfill({ json: foundation });
  });

  await page.goto(foundationPath);
  await expect(page.getByText('Cargando datos del evento…')).toBeVisible();
  releaseResponse();

  await expect(page.getByRole('heading', { name: 'Encuentro del barrio' })).toBeVisible();
  expect(requestedPath).toBe(foundationPath);
  await expect(page.locator('html')).toHaveAttribute('data-api-credentials', /^(include,){2,}$/);
  await expect(
    page.getByText('Datos del endpoint · No aprueban la propuesta del MVP'),
  ).toBeVisible();
  await expect(page.getByText('Europe/Madrid')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Batalla de crews' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Sedes' }).getByText('Centro cultural'),
  ).toBeVisible();
  await expect(page.getByText('Borrador')).toBeVisible();
});

test('shows foundation context and navigates to the only global admin destination', async ({
  page,
}) => {
  await page.route(foundationEndpoint, (route) => route.fulfill({ json: foundation }));
  await page.goto(foundationPath);
  const header = page.getByRole('banner', { name: 'Espacio de administración' });
  await expect(header.getByText('Fundamentos del evento')).toBeVisible();
  await expect(header.getByText(eventId)).toHaveCount(0);
  const nav = page.getByRole('navigation', { name: 'Navegación administrativa' });
  const home = nav.getByRole('link', { name: 'Resumen' });
  await expect(home).not.toHaveAttribute('aria-current', 'page');
  await expect(header.getByRole('link')).toHaveCount(0);
  await home.click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(home).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Vista de planificación · Datos de ejemplo')).toBeVisible();
});

test('keeps event context and the only usable destination accessible at 375px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.route(foundationEndpoint, (route) => route.fulfill({ json: foundation }));
  await page.goto(foundationPath);
  const header = page.getByRole('banner', { name: 'Espacio de administración' });
  await expect(header.getByText('Fundamentos del evento')).toBeVisible();
  await expect(header.getByText(eventId)).toHaveCount(0);
  const home = page
    .getByRole('navigation', { name: 'Navegación administrativa' })
    .getByRole('link', { name: 'Resumen' });
  await expect(home).not.toHaveAttribute('aria-current', 'page');
  await expect(header.getByRole('link')).toHaveCount(0);
  const signOut = header.getByRole('button', { name: 'Cerrar sesión' });
  await page.keyboard.press('Tab');
  await expect(header.getByRole('button', { name: 'Tema oscuro' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(signOut).toBeFocused();
  await expect(signOut).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Tab');
  await expect(home).toBeFocused();
  await expect(home).toHaveCSS('outline-style', 'solid');
  const scrollWidth = await page.evaluate(
    () =>
      (globalThis as unknown as { document: { documentElement: { scrollWidth: number } } }).document
        .documentElement.scrollWidth,
  );
  expect(scrollWidth).toBeLessThanOrEqual(375);
  await home.click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(home).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Vista de planificación · Datos de ejemplo')).toBeVisible();
});

test('shows an empty activities state for a persisted event', async ({ page }) => {
  await page.route(foundationEndpoint, (route) =>
    route.fulfill({ json: { ...foundation, venues: [], activities: [] } }),
  );

  await page.goto(foundationPath);
  await expect(page.getByRole('heading', { name: 'Encuentro del barrio' })).toBeVisible();
  await expect(page.getByText('Aún no hay actividades para este evento.')).toBeVisible();
});

test('shows a safe failure for missing events and server errors', async ({ page }) => {
  await page.route(foundationEndpoint, (route) =>
    route.fulfill({ status: 404, json: { message: 'Private backend detail' } }),
  );
  await page.goto(foundationPath);
  await expect(page.getByRole('alert')).toContainText(
    'No se pudo cargar la información del evento.',
  );
  await expect(page.getByText('Private backend detail')).toHaveCount(0);

  await page.route(foundationEndpoint, (route) =>
    route.fulfill({ status: 500, json: { message: 'Internal database detail' } }),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText(
    'No se pudo cargar la información del evento.',
  );
  await expect(page.getByText('Internal database detail')).toHaveCount(0);
});
