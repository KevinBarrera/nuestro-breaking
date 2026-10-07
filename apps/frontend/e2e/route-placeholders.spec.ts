import { expect, test } from '@playwright/test';

const sessionEndpoint = (url: URL) => url.port === '3000' && url.pathname === '/auth/session';
const signInEndpoint = (url: URL) => url.port === '3000' && url.pathname === '/auth/admin/sign-in';
const signOutEndpoint = (url: URL) => url.port === '3000' && url.pathname === '/auth/sign-out';
const adminEventsEndpoint = (url: URL) => url.port === '3000' && url.pathname === '/admin/events';
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

test('presents a centered, responsive and accessible Spanish admin sign-in panel', async ({
  page,
}) => {
  await page.route(sessionEndpoint, (route) => route.fulfill({ status: 401, json: {} }));
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/admin');
    const panel = page.getByRole('region', { name: 'Acceso administrativo' });
    await expect(panel.getByText('Los más pesados · Administración')).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(
      panel.getByText('Accede con tu cuenta del equipo organizador o de jueces.'),
    ).toBeVisible();
    await expect(panel.getByText('Acceso exclusivo para el equipo autorizado.')).toBeVisible();
    const email = panel.getByRole('textbox', { name: 'Correo electrónico' });
    const password = panel.getByLabel('Contraseña');
    const button = panel.getByRole('button', { name: 'Iniciar sesión' });
    await expect(email).toHaveAttribute('autocomplete', 'username');
    await expect(password).toHaveAttribute('type', 'password');
    await expect(button).toHaveAttribute('type', 'submit');
    const bounds = await panel.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThan(300);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(Math.abs(bounds!.x + bounds!.width / 2 - width / 2)).toBeLessThan(2);
    await expect(email).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(button).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const buttonBounds = await button.boundingBox();
    expect(buttonBounds!.height).toBeGreaterThanOrEqual(44);
  }
});

test('shows a safe sign-in error after keyboard submission without revealing admin content', async ({
  page,
}) => {
  await page.route(sessionEndpoint, (route) => route.fulfill({ status: 401, json: {} }));
  await page.route(signInEndpoint, (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico').fill('admin@example.com');
  await page.getByLabel('Contraseña').fill('wrong');
  await page.getByLabel('Contraseña').press('Enter');
  await expect(page.getByRole('alert')).toHaveText(
    'No se pudo iniciar sesión. Revisa tus datos e inténtalo de nuevo.',
  );
  await expect(page.getByRole('heading', { name: 'Administración' })).toHaveCount(0);
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

test('signs out an admin using the session CSRF header and clears local identity', async ({
  page,
}) => {
  const csrf = 'session-bound-csrf';
  let sessionRequests = 0;
  await page.route(sessionEndpoint, (route) => {
    sessionRequests += 1;
    return route.fulfill({
      headers: { 'X-CSRF-Token': csrf, 'Access-Control-Expose-Headers': 'X-CSRF-Token' },
      json: { user, expiresAt: '2026-11-14T18:00:00.000Z' },
    });
  });
  await page.addInitScript({
    content: `
      const originalFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        if (String(input).includes('/auth/sign-out')) {
          document.documentElement.dataset.signOutCredentials = init?.credentials || '';
        }
        return originalFetch(input, init);
      };
    `,
  });
  let signOutRequests = 0;
  await page.route(signOutEndpoint, (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': 'http://127.0.0.1:4173',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'X-CSRF-Token',
        },
      });
    signOutRequests += 1;
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['x-csrf-token']).toBe(csrf);
    return route.fulfill({ status: 200, json: {} });
  });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible();
  await page
    .getByRole('banner', { name: 'Espacio de administración' })
    .getByRole('button', { name: 'Cerrar sesión' })
    .click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Administración' })).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-sign-out-credentials', 'include');
  expect(sessionRequests).toBeGreaterThanOrEqual(2);
  expect(signOutRequests).toBe(1);
  expect(
    await page.evaluate(async () => {
      // A runtime path served by Vite in the browser, not resolvable by the Node typecheck.
      const source = '/src/entities/session/model/session-store.ts';
      const module: unknown = await import(source);
      const store = module as { useSessionStore: { getState: () => { session: unknown } } };
      return store.useSessionStore.getState().session;
    }),
  ).toEqual({ user: null });
});

test('does not sign out without a session CSRF header', async ({ page }) => {
  let sessionRequests = 0;
  await page.route(sessionEndpoint, (route) => {
    sessionRequests += 1;
    return route.fulfill({ json: { user } });
  });
  let signOutRequests = 0;
  await page.route(signOutEndpoint, (route) => {
    signOutRequests += 1;
    return route.fulfill({ status: 200, json: {} });
  });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(
    page.getByRole('banner', { name: 'Espacio de administración' }).getByRole('alert'),
  ).toHaveText('No se pudo cerrar sesión.');
  await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible();
  expect(sessionRequests).toBeGreaterThanOrEqual(2);
  expect(signOutRequests).toBe(0);
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

test('shows the authenticated admin shell with only the available navigation and sign-out', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route(sessionEndpoint, (route) => route.fulfill({ json: { user } }));
  await page.goto('/admin');
  const header = page.getByRole('banner', { name: 'Espacio de administración' });
  await expect(header.getByText('LOS MÁS PESADOS')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Navegación administrativa' });
  await expect(nav.getByRole('link', { name: 'Resumen' })).toHaveAttribute('href', '/admin');
  const home = nav.getByRole('link', { name: 'Resumen' });
  await expect(home).toHaveAttribute('aria-current', 'page');
  await expect(home).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(header.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  await expect(header.getByRole('link')).toHaveCount(0);
  await expect(page.getByText('Vista de planificación · Datos de ejemplo')).toBeVisible();
});

test('keeps the planning label distinct from live data on a narrow keyboard-accessible admin header', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.route(sessionEndpoint, (route) => route.fulfill({ json: { user } }));
  // Even with a manageable event loaded, /admin has no event in the URL, so no selector.
  let eventsRequested = false;
  await page.route(adminEventsEndpoint, (route) => {
    eventsRequested = true;
    return route.fulfill({
      json: [{ id: 'a1b2c3d4-1234-4567-89ab-123456789abc', name: 'Encuentro del barrio' }],
    });
  });
  await page.goto('/admin');
  const header = page.getByRole('banner', { name: 'Espacio de administración' });
  await expect.poll(() => eventsRequested).toBe(true);
  await expect(header.getByRole('combobox', { name: 'Evento' })).toHaveCount(0);
  const home = page
    .getByRole('navigation', { name: 'Navegación administrativa' })
    .getByRole('link', { name: 'Resumen' });
  const signOut = header.getByRole('button', { name: 'Cerrar sesión' });
  await expect(home).toHaveAttribute('aria-current', 'page');
  await expect(header.getByRole('link')).toHaveCount(0);
  await expect(page.getByText('Vista de planificación · Datos de ejemplo')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Evento de ejemplo' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(header.getByRole('button', { name: 'Tema oscuro' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(signOut).toBeFocused();
  await expect(signOut).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Tab');
  await expect(home).toBeFocused();
  await expect(home).toHaveCSS('outline-style', 'solid');
  for (const control of [home, signOut]) {
    const bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  const scrollWidth = await page.evaluate(
    () =>
      (globalThis as unknown as { document: { documentElement: { scrollWidth: number } } }).document
        .documentElement.scrollWidth,
  );
  expect(scrollWidth).toBeLessThanOrEqual(375);
});

test('retains admin content and alerts on failed sign-out, then exits after a successful retry', async ({
  page,
}) => {
  const csrf = 'session-bound-csrf';
  await page.route(sessionEndpoint, (route) =>
    route.fulfill({
      headers: { 'X-CSRF-Token': csrf, 'Access-Control-Expose-Headers': 'X-CSRF-Token' },
      json: { user },
    }),
  );
  let attempts = 0;
  await page.route(signOutEndpoint, (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': 'http://127.0.0.1:4173',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'X-CSRF-Token',
        },
      });
    attempts += 1;
    expect(route.request().headers()['x-csrf-token']).toBe(csrf);
    return route.fulfill({ status: attempts === 1 ? 500 : 200, json: {} });
  });
  await page.goto('/admin');
  const header = page.getByRole('banner', { name: 'Espacio de administración' });
  const signOut = header.getByRole('button', { name: 'Cerrar sesión' });
  await expect(page.getByText('Vista de planificación · Datos de ejemplo')).toBeVisible();
  await signOut.click();
  await expect(header.getByRole('alert')).toHaveText('No se pudo cerrar sesión.');
  await expect(page.getByText('Vista de planificación · Datos de ejemplo')).toBeVisible();
  await expect(signOut).toBeEnabled();
  await signOut.click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(header).toHaveCount(0);
  await expect(page.getByText('Vista de planificación · Datos de ejemplo')).toHaveCount(0);
  expect(attempts).toBe(2);
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
