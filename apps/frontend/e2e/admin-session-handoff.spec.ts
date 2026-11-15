import { expect, test, type Page } from '@playwright/test';
import { activationToken, mockActivation } from './support/activation-mocks.ts';
import { mockAdminApi } from './support/admin-mocks.ts';

// One session cookie per browser (#392): screens must not keep acting as a session that ended
// or changed in another tab.
const api = (path: string) => (url: URL) => url.port === '3000' && url.pathname === path;
const signedInAdmin = {
  id: 'admin-1',
  displayName: 'Chava',
  roles: ['admin'],
  globalAdmin: true,
};

const otherAdmin = { id: 'admin-2', displayName: 'Zzain', roles: ['admin'], globalAdmin: true };

// The browser's one session, swappable mid-test: `null` answers 401 (no session).
function sessionMock(page: Page, initial: typeof signedInAdmin | null) {
  const state = { user: initial, signOuts: 0 };
  return page
    .route(api('/auth/session'), (route) =>
      state.user
        ? route.fulfill({
            headers: { 'X-CSRF-Token': 'csrf', 'Access-Control-Expose-Headers': 'X-CSRF-Token' },
            json: { user: state.user },
          })
        : route.fulfill({ status: 401, json: {} }),
    )
    .then(() =>
      page.route(api('/auth/sign-out'), (route) => {
        if (route.request().method() === 'OPTIONS')
          return route.fulfill({
            status: 204,
            headers: {
              'Access-Control-Allow-Origin': new URL(page.url()).origin,
              'Access-Control-Allow-Credentials': 'true',
              'Access-Control-Allow-Methods': 'POST',
              'Access-Control-Allow-Headers': 'X-CSRF-Token',
            },
          });
        state.signOuts += 1;
        state.user = null;
        return route.fulfill({ json: { signedOut: true } });
      }),
    )
    .then(() => state);
}

async function activateInThisBrowser(page: Page) {
  await mockActivation(page);
  await page.goto(`/activar-cuenta#${activationToken}`);
  const form = page.getByRole('form', { name: 'Activa tu cuenta' });
  await form.getByLabel('Crea tu contraseña').fill('Breaking2026!');
  await form.getByLabel('Repite la contraseña').fill('Breaking2026!');
  await form.getByRole('button', { name: 'Activar cuenta' }).click();
  await expect(page).toHaveURL('/admin');
}

const inUse = (page: Page) => page.getByRole('region', { name: 'Hay otra sesión abierta' });

async function signedInOnEvents(page: Page) {
  await mockAdminApi(page);
  await page.route(api('/auth/session'), (route) =>
    route.fulfill({
      headers: { 'X-CSRF-Token': 'csrf', 'Access-Control-Expose-Headers': 'X-CSRF-Token' },
      json: { user: signedInAdmin },
    }),
  );
  await page.goto('/admin');
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
}

test('a screen that gets 401 returns to sign-in and says the session ended', async ({ page }) => {
  await signedInOnEvents(page);
  await page.route(api('/admin/team'), (route) =>
    route.fulfill({ status: 401, json: { message: 'Unauthenticated' } }),
  );

  await page.getByRole('link', { name: 'Equipo' }).first().click();

  const panel = page.getByRole('region', { name: 'Acceso administrativo' });
  await expect(panel.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(
    panel.getByRole('status').filter({ hasText: 'Tu sesión terminó. Inicia sesión de nuevo' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0);
  await expect(page.getByText(/^Sin acceso/)).toHaveCount(0);
});

test('a screen that gets 403 keeps the "Sin acceso" message and the session', async ({ page }) => {
  await signedInOnEvents(page);
  await page.route(api('/admin/team'), (route) =>
    route.fulfill({ status: 403, json: { message: 'Forbidden' } }),
  );

  await page.getByRole('link', { name: 'Equipo' }).first().click();

  await expect(page.getByText(/^Sin acceso/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toHaveCount(0);
});

test("activating in a browser signed in as another admin does not open that admin's panel", async ({
  page,
}) => {
  await mockAdminApi(page);
  const session = await sessionMock(page, signedInAdmin);
  await activateInThisBrowser(page);

  await expect(inUse(page).getByRole('heading', { name: 'Hay otra sesión abierta' })).toBeVisible();
  await expect(inUse(page)).toContainText(
    'Activaste la cuenta staff1@example.org, pero este navegador tiene abierta la sesión de Chava.',
  );
  await expect(page.getByRole('heading', { name: 'Eventos', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0);

  await inUse(page).getByRole('button', { name: 'Cerrar la sesión de Chava' }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  expect(session.signOuts).toBe(1);
  await expect(page.getByRole('status')).toHaveText(
    'Tu cuenta está activa. Inicia sesión con tu correo y tu nueva contraseña.',
  );
  await expect(page.getByLabel('Correo electrónico')).toHaveValue('staff1@example.org');
});

test('after activating, the open session can still be kept on purpose', async ({ page }) => {
  await mockAdminApi(page);
  const session = await sessionMock(page, signedInAdmin);
  await activateInThisBrowser(page);

  await inUse(page).getByRole('button', { name: 'Continuar como Chava' }).click();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  await expect(page).toHaveURL('/admin');
  expect(session.signOuts).toBe(0);
});

test('a tab that regains focus after another account signed in stops acting as the old one', async ({
  page,
}) => {
  await mockAdminApi(page);
  const session = await sessionMock(page, signedInAdmin);
  await page.goto('/admin');
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();

  session.user = otherAdmin;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  await expect(inUse(page)).toContainText(
    'La sesión de este navegador cambió: ahora es la de Zzain.',
  );
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0);
  await inUse(page).getByRole('button', { name: 'Continuar como Zzain' }).click();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
});

test('a tab that regains focus after signing out elsewhere returns to sign-in', async ({
  page,
}) => {
  await mockAdminApi(page);
  const session = await sessionMock(page, signedInAdmin);
  await page.goto('/admin');
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();

  session.user = null;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByText('Tu sesión terminó. Inicia sesión de nuevo')).toBeVisible();
});

test('regaining focus with the same session keeps the open screen', async ({ page }) => {
  await mockAdminApi(page);
  let checks = 0;
  await page.route(api('/auth/session'), (route) => {
    checks += 1;
    return route.fulfill({ json: { user: signedInAdmin } });
  });
  await page.goto('/admin');
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  const before = checks;

  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  await expect.poll(() => checks).toBeGreaterThan(before);
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  await expect(inUse(page)).toHaveCount(0);
});
