import { expect, test } from '@playwright/test';

const firstId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const secondId = 'b1b2c3d4-1234-4567-89ab-123456789abc';
const events = [
  { id: firstId, name: 'Encuentro del barrio' },
  { id: secondId, name: 'Batalla de otoño' },
];
const api = (url: URL) => url.port === '3000';

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => api(url) && url.pathname === '/auth/session',
    (route) => route.fulfill({ json: { user: { id: 'admin', roles: ['admin'] } } }),
  );
  await page.route(
    (url) => api(url) && url.pathname === '/admin/events',
    (route) => route.fulfill({ json: events }),
  );
  await page.route(
    (url) => api(url) && url.pathname.endsWith('/activities'),
    (route) => route.fulfill({ json: [] }),
  );
});

test('toggles the theme, persists it across reloads and keeps a 44px target', async ({ page }) => {
  await page.goto('/admin');
  const html = page.locator('html');
  const toggle = page.getByRole('button', { name: 'Tema oscuro' });
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const bounds = await toggle.boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Tema oscuro' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('applies the stored theme before the app renders', async ({ page }) => {
  // Records the theme present when React first mounts content into #root.
  await page.addInitScript({
    content: `
      localStorage.setItem('nb-theme', 'dark');
      new MutationObserver(() => {
        const root = document.getElementById('root');
        if (root && !root.dataset.firstTheme && root.childElementCount > 0)
          root.dataset.firstTheme = document.documentElement.dataset.theme || 'none';
      }).observe(document, { childList: true, subtree: true });
    `,
  });
  await page.goto('/admin');
  await expect(page.locator('#root')).toHaveAttribute('data-first-theme', 'dark');
});

test('falls back to the light theme when storage throws', async ({ page }) => {
  await page.addInitScript({
    content: `
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new Error('Storage disabled');
        },
      });
    `,
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/admin');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'light');
  const toggle = page.getByRole('button', { name: 'Tema oscuro' });
  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  expect(errors).toEqual([]);
});
