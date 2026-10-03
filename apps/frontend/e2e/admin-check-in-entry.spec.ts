import { expect, test } from '@playwright/test';

const firstId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const secondId = 'b1b2c3d4-1234-4567-89ab-123456789abc';
const endpoint = (url: URL) => url.port === '3000' && url.pathname === '/admin/events';
const session = (url: URL) => url.port === '3000' && url.pathname === '/auth/session';
const events = [
  { id: firstId, name: 'Encuentro del barrio' },
  { id: secondId, name: 'Batalla de otoño' },
];

test.beforeEach(async ({ page }) => {
  await page.route(session, (route) =>
    route.fulfill({ json: { user: { id: 'admin', roles: ['admin'] } } }),
  );
});

test('global admin sees server-provided events, not sample events, and follows a real check-in link', async ({
  page,
}) => {
  await page.route(endpoint, (route) => {
    expect(route.request().method()).toBe('GET');
    return route.fulfill({ json: events });
  });
  await page.route(
    (url) => url.port === '3000' && url.pathname.endsWith('/participants'),
    (route) => route.fulfill({ json: { total: 0, limit: 20, offset: 0, results: [] } }),
  );
  await page.goto('/admin');
  const real = page.getByRole('region', { name: 'Eventos para el control de acceso' });
  await expect(real.getByRole('link', { name: /Encuentro del barrio/ })).toHaveAttribute(
    'href',
    `/admin/events/${firstId}/check-in`,
  );
  await expect(real.getByRole('link', { name: /Batalla de otoño/ })).toHaveAttribute(
    'href',
    `/admin/events/${secondId}/check-in`,
  );
  await expect(
    page.getByRole('region', { name: 'Evento de ejemplo' }).getByRole('link'),
  ).toHaveCount(0);
  await real.getByRole('link', { name: /Encuentro del barrio/ }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/events/${firstId}/check-in$`));
  await expect(page.getByRole('heading', { name: 'Control de entrada' })).toBeVisible();
});

test('event-scoped admin only sees returned events, with a usable link on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  // Session identities expose role names, not event scopes; the server filters this admin's list.
  await page.route(session, (route) =>
    route.fulfill({ json: { user: { id: 'second-event-admin', roles: ['admin'] } } }),
  );
  await page.route(endpoint, (route) => route.fulfill({ json: [events[1]] }));
  await page.goto('/admin');
  const real = page.getByRole('region', { name: 'Eventos para el control de acceso' });
  await expect(real.getByRole('link', { name: /Batalla de otoño/ })).toHaveAttribute(
    'href',
    `/admin/events/${secondId}/check-in`,
  );
  await expect(real.getByText('Encuentro del barrio')).toHaveCount(0);
  const width = await page.evaluate(
    () =>
      (globalThis as unknown as { document: { documentElement: { scrollWidth: number } } }).document
        .documentElement.scrollWidth,
  );
  expect(width).toBeLessThanOrEqual(375);
});

test('loading and empty list never present sample content as live', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(endpoint, async (route) => {
    await held;
    await route.fulfill({ json: [] });
  });
  await page.goto('/admin');
  const real = page.getByRole('region', { name: 'Eventos para el control de acceso' });
  await expect(real.getByRole('status')).toContainText('Cargando eventos');
  await expect(real.getByRole('link')).toHaveCount(0);
  release();
  await expect(
    real.getByText('No hay eventos disponibles para el control de acceso.'),
  ).toBeVisible();
  await expect(real.getByRole('link')).toHaveCount(0);
  await expect(page.getByText('Vista de planificación · Datos de ejemplo')).toBeVisible();
});

test('aborts the credentialed event request when leaving the admin landing', async ({ page }) => {
  await page.addInitScript({
    content: `
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (String(input).endsWith('/admin/events')) {
        document.documentElement.dataset.eventCredentials = String(init?.credentials);
        init?.signal?.addEventListener('abort', () => {
          sessionStorage.setItem('eventRequestAborted', 'yes');
        });
      }
      return originalFetch(input, init);
    };
  `,
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(endpoint, async (route) => {
    await held;
    await route.fulfill({ json: events });
  });
  await page.goto('/admin');
  await expect(page.locator('html')).toHaveAttribute('data-event-credentials', 'include');
  await page.evaluate(`
    history.pushState(null, '', '/admin/events/${firstId}/check-in');
    dispatchEvent(new PopStateEvent('popstate'));
  `);
  await expect(page.getByRole('heading', { name: 'Control de entrada' })).toBeVisible();
  await expect
    .poll(() => page.evaluate("sessionStorage.getItem('eventRequestAborted')"))
    .toBe('yes');
  release();
  await expect(page.getByRole('region', { name: 'Eventos para el control de acceso' })).toHaveCount(
    0,
  );
});

test('signed out never fetches events; 401 and 403 do not claim authorization', async ({
  page,
}) => {
  let requests = 0;
  await page.route(endpoint, (route) => {
    requests++;
    return route.fulfill({ json: events });
  });
  await page.route(session, (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  expect(requests).toBe(0);
  for (const status of [401, 403]) {
    await page.route(session, (route) =>
      route.fulfill({ json: { user: { id: 'judge', roles: ['judge'] } } }),
    );
    await page.route(endpoint, (route) => route.fulfill({ status, json: { message: 'private' } }));
    await page.reload();
    const real = page.getByRole('region', { name: 'Eventos para el control de acceso' });
    await expect(real.getByRole('alert')).toContainText('Acceso denegado');
    await expect(real.getByRole('link')).toHaveCount(0);
    await expect(real.getByText('private')).toHaveCount(0);
  }
});

test('server errors and malformed IDs do not create links or expose backend details', async ({
  page,
}) => {
  await page.route(endpoint, (route) =>
    route.fulfill({ status: 500, json: { message: 'private' } }),
  );
  await page.goto('/admin');
  const real = page.getByRole('region', { name: 'Eventos para el control de acceso' });
  await expect(real.getByRole('alert')).toContainText('No se pudieron cargar los eventos');
  await expect(real.getByText('private')).toHaveCount(0);
  await page.route(endpoint, (route) => route.fulfill({ json: [{ id: 'sample', name: 'Falso' }] }));
  await page.reload();
  await expect(real.getByRole('alert')).toContainText('No se pudieron cargar los eventos');
  await expect(real.getByRole('link')).toHaveCount(0);
});
