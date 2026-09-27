import { expect, test } from '@playwright/test';

const sessionEndpoint = (url: URL) => url.port === '3000' && url.pathname === '/auth/session';
const signInEndpoint = (url: URL) => url.port === '3000' && url.pathname === '/auth/admin/sign-in';
const user = { id: 'admin-1', email: 'admin@example.com', displayName: 'Admin', roles: ['admin'] };

test('guards admin content when the backend session is missing', async ({ page }) => {
  let sessionRequests = 0;
  await page.route(sessionEndpoint, (route) => {
    sessionRequests += 1;
    return route.fulfill({ status: 401, json: { message: 'Unauthorized' } });
  });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Administración' })).toHaveCount(0);
  expect(sessionRequests).toBeGreaterThan(0);
});

test('allows a judge session and denies a dancer-only session', async ({ page }) => {
  await page.route(sessionEndpoint, (route) =>
    route.fulfill({ json: { user: { ...user, roles: ['judge'] } } }),
  );
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible();
  await page.route(sessionEndpoint, (route) =>
    route.fulfill({ json: { user: { ...user, roles: ['dancer'] } } }),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Administración' })).toHaveCount(0);
});

test('signs in with the backend and only then reveals admin content', async ({ page }) => {
  await page.route(sessionEndpoint, (route) => route.fulfill({ status: 401, json: {} }));
  let submitted: unknown;
  await page.addInitScript({
    content: `
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (String(input).includes('/auth/')) {
        document.documentElement.dataset.authCredentials =
          (document.documentElement.dataset.authCredentials || '') + init?.credentials + ',';
      }
      return originalFetch(input, init);
    };
  `,
  });
  await page.route(signInEndpoint, async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: { user, csrfToken: 'do-not-store-this-token' } });
  });
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico').fill('admin@example.com');
  await page.getByLabel('Contraseña').fill('secret');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible();
  expect(submitted).toEqual({ email: 'admin@example.com', password: 'secret' });
  await expect(page.locator('html')).toHaveAttribute('data-auth-credentials', /^(include,){2,}$/);
  await expect(page.getByText('do-not-store-this-token')).toHaveCount(0);
});

test('keeps admin content hidden after rejected credentials', async ({ page }) => {
  await page.route(sessionEndpoint, (route) => route.fulfill({ status: 401, json: {} }));
  await page.route(signInEndpoint, (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico').fill('admin@example.com');
  await page.getByLabel('Contraseña').fill('wrong');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Administración' })).toHaveCount(0);
});

test('renders a Spanish sample event and activity foundation at /admin', async ({ page }) => {
  await page.route(sessionEndpoint, (route) =>
    route.fulfill({ json: { user, expiresAt: '2026-11-14T18:00:00.000Z' } }),
  );
  await page.goto('/admin');

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible();
  await expect(
    page.getByText(
      'Vista preliminar del espacio de administración para el equipo organizador y los jueces.',
    ),
  ).toBeVisible();
  await expect(page.getByText('Vista de planificación · Datos de ejemplo')).toBeVisible();
  await expect(
    page.getByText('La propuesta del MVP de noviembre sigue en borrador; no está aprobada.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fin de semana de breaking' })).toBeVisible();
  const event = page.getByRole('region', { name: 'Evento de ejemplo' });
  const summary = event.getByRole('article', { name: 'Fin de semana de breaking' });
  await expect(summary.getByText('Fecha ilustrativa')).toBeVisible();
  await expect(summary.getByText('14 de noviembre')).toBeVisible();
  await expect(summary.getByText('Sede')).toBeVisible();
  await expect(summary.getByText('Por confirmar')).toBeVisible();

  const activities = event.getByRole('region', { name: 'Actividades de ejemplo' });
  const battle = activities.getByRole('article', { name: 'Batalla individual' });
  await expect(battle.getByText('Borrador')).toBeVisible();
  await expect(battle.getByText('Batalla', { exact: true })).toBeVisible();
  await expect(battle.getByText('14 de noviembre, 10:00')).toBeVisible();
  await expect(battle.getByText('Pista principal')).toBeVisible();
  await expect(battle.getByText('Precio')).toBeVisible();
  await expect(battle.getByText('Cupo')).toBeVisible();
  await expect(battle.getByText('Por confirmar')).toHaveCount(2);

  const workshop = activities.getByRole('article', { name: 'Taller de equipos' });
  await expect(workshop.getByText('Borrador')).toBeVisible();
  await expect(workshop.getByText('Taller', { exact: true })).toBeVisible();
  await expect(workshop.getByText('14 de noviembre, 14:00')).toBeVisible();
  await expect(workshop.getByText('Sala de talleres')).toBeVisible();

  const planning = page.getByRole('region', { name: 'Estado de planificación' });
  await expect(planning.getByText('2 actividades de ejemplo')).toBeVisible();
  await expect(planning.getByText('Pendiente de definir')).toBeVisible();
  await expect(
    page.getByText(
      'Los campos que dependen de la organización siguen siendo configurables o quedan pendientes de definir.',
    ),
  ).toBeVisible();
});

test('renders the dancer placeholder at /dancer', async ({ page }) => {
  await page.goto('/dancer');

  await expect(page).toHaveURL(/\/dancer$/);
  await expect(page.getByRole('heading', { name: 'Dancer area' })).toBeVisible();
  await expect(
    page.getByText('The future dancer workspace is available at /dancer.'),
  ).toBeVisible();
});
