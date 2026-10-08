import { expect, test, type Page } from '@playwright/test';

const firstId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const secondId = 'b1b2c3d4-1234-4567-89ab-123456789abc';
const endpoint = (url: URL) => url.port === '3000' && url.pathname === '/admin/events';
const session = (url: URL) => url.port === '3000' && url.pathname === '/auth/session';
const events = [
  { id: firstId, name: 'Encuentro del barrio' },
  { id: secondId, name: 'Batalla de otoño' },
];
// Copy from the retired sample planning view; none of it may come back.
const sampleCopy = [
  'Datos de ejemplo',
  'Fin de semana de breaking',
  'Estado de planificación',
  'Evento de ejemplo',
  'Actividades de ejemplo',
  'sigue en borrador',
];

test.beforeEach(async ({ page }) => {
  await page.route(session, (route) =>
    route.fulfill({ json: { user: { id: 'admin', roles: ['admin'] } } }),
  );
});

const main = (page: Page) => page.getByRole('main');
const card = (page: Page, name: string) => main(page).getByRole('article', { name });

async function expectNoSampleContent(page: Page) {
  for (const text of sampleCopy) await expect(page.getByText(text)).toHaveCount(0);
}

test('several events show a picker built only from the returned events', async ({ page }) => {
  await page.route(endpoint, (route) => {
    expect(route.request().method()).toBe('GET');
    return route.fulfill({ json: events });
  });
  await page.route(
    (url) => url.port === '3000' && url.pathname.endsWith('/participants'),
    (route) => route.fulfill({ json: { total: 0, limit: 20, offset: 0, results: [] } }),
  );
  await page.goto('/admin');
  await expect(main(page).getByRole('heading', { name: 'Eventos', level: 1 })).toBeVisible();
  for (const event of events) {
    const eventCard = card(page, event.name);
    await expect(eventCard.getByRole('heading', { name: event.name, level: 2 })).toBeVisible();
    await expect(eventCard.getByRole('link', { name: 'Abrir evento' })).toHaveAttribute(
      'href',
      `/admin/events/${event.id}`,
    );
    for (const [name, section] of [
      ['Check-in', 'check-in'],
      ['Actividades', 'activities'],
      ['Pases', 'passes'],
    ])
      await expect(eventCard.getByRole('link', { name, exact: true })).toHaveAttribute(
        'href',
        `/admin/events/${event.id}/${section}`,
      );
  }
  await expect(page).toHaveURL(/\/admin$/);
  await expectNoSampleContent(page);

  await card(page, 'Encuentro del barrio').getByRole('link', { name: 'Check-in' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/events/${firstId}/check-in$`));
  await expect(page.getByRole('heading', { name: 'Control de entrada' })).toBeVisible();
});

test('a single event redirects to its overview without leaving /admin in history', async ({
  page,
}) => {
  await page.route(endpoint, (route) => route.fulfill({ json: [events[1]] }));
  await page.route(
    (url) => url.port === '3000' && url.pathname.startsWith(`/admin/events/${secondId}/`),
    (route) => route.fulfill({ json: [] }),
  );
  await page.goto('/admin');
  await expect(page).toHaveURL(new RegExp(`/admin/events/${secondId}$`));
  await expect(page.getByRole('heading', { name: 'Resumen del evento' })).toBeVisible();
  await expectNoSampleContent(page);
  // Replace navigation: going back leaves the app instead of bouncing through /admin again.
  await page.goBack();
  await expect(page).not.toHaveURL(/\/admin/);
});

test('the picker fits a phone without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.route(endpoint, (route) => route.fulfill({ json: events }));
  await page.goto('/admin');
  const open = card(page, 'Batalla de otoño').getByRole('link', { name: 'Abrir evento' });
  await expect(open).toBeVisible();
  const bounds = await open.boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(
    375,
  );
});

test('loading, then an empty list shows the empty state and no links', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(endpoint, async (route) => {
    await held;
    await route.fulfill({ json: [] });
  });
  await page.goto('/admin');
  await expect(main(page).getByRole('status')).toContainText('Cargando eventos');
  await expect(main(page).getByRole('link')).toHaveCount(0);
  release();
  await expect(main(page).getByText('No hay eventos disponibles para tu cuenta.')).toBeVisible();
  await expect(main(page).getByRole('link')).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin$/);
  await expectNoSampleContent(page);
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
  await expect(page.getByRole('heading', { name: 'Eventos', exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/admin/events/${firstId}/check-in$`));
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
    await expect(main(page).getByRole('alert')).toContainText('Sin acceso');
    await expect(main(page).getByRole('link')).toHaveCount(0);
    await expect(page.getByText('private')).toHaveCount(0);
  }
});

test('a failed load shows a Spanish error with a retry that recovers', async ({ page }) => {
  let fail = true;
  await page.route(endpoint, (route) =>
    fail
      ? route.fulfill({ status: 500, json: { message: 'private' } })
      : route.fulfill({ json: events }),
  );
  await page.goto('/admin');
  const alert = main(page).getByRole('alert');
  await expect(alert).toContainText('No se pudieron cargar los eventos');
  await expect(page.getByText('private')).toHaveCount(0);
  await expect(main(page).getByRole('link')).toHaveCount(0);
  fail = false;
  await alert.getByRole('button', { name: 'Reintentar' }).click();
  await expect(card(page, 'Encuentro del barrio')).toBeVisible();
  await expect(main(page).getByRole('alert')).toHaveCount(0);
});

test('malformed event IDs never become links', async ({ page }) => {
  await page.route(endpoint, (route) => route.fulfill({ json: [{ id: 'sample', name: 'Falso' }] }));
  await page.goto('/admin');
  await expect(main(page).getByRole('alert')).toContainText('No se pudieron cargar los eventos');
  await expect(main(page).getByRole('link')).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin$/);
});
