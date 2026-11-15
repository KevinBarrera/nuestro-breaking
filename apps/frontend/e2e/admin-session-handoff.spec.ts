import { expect, test, type Page } from '@playwright/test';
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
