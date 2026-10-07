import { expect, test, type Page } from '@playwright/test';

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

const sideNav = (page: Page) => page.getByRole('navigation', { name: 'Navegación administrativa' });

test('renders the shell with grouped navigation and unavailable sections disabled', async ({
  page,
}) => {
  await page.goto('/admin');
  const header = page.getByRole('banner', { name: 'Espacio de administración' });
  await expect(header.getByText('NUESTRO BREAKING')).toBeVisible();
  await expect(header.getByText('ADMIN', { exact: true })).toBeVisible();
  const nav = sideNav(page);
  await expect(nav.getByText('OPERACIÓN')).toBeVisible();
  await expect(nav.getByText('CATÁLOGO')).toBeVisible();
  const overview = nav.getByRole('link', { name: 'Resumen' });
  await expect(overview).toHaveAttribute('href', '/admin');
  await expect(overview).toHaveAttribute('aria-current', 'page');
  for (const name of ['Inscripciones', 'Listas de respaldo']) {
    const item = nav.getByRole('link', { name: new RegExp(name) });
    await expect(item).toHaveAttribute('aria-disabled', 'true');
    await expect(item).not.toHaveAttribute('href');
    await expect(item).toContainText('Próximamente');
  }
  // Without an event in the URL, event-scoped sections cannot be reached yet.
  for (const name of ['Check-in', 'Actividades', 'Pases']) {
    await expect(nav.getByRole('link', { name })).toHaveAttribute('aria-disabled', 'true');
  }
});

test('links event sections, marks the active one and switches events in place', async ({
  page,
}) => {
  await page.goto(`/admin/events/${firstId}/activities`);
  const nav = sideNav(page);
  const activities = nav.getByRole('link', { name: 'Actividades' });
  await expect(activities).toHaveAttribute('aria-current', 'page');
  await expect(activities).toHaveAttribute('href', `/admin/events/${firstId}/activities`);
  await expect(nav.getByRole('link', { name: 'Pases' })).toHaveAttribute(
    'href',
    `/admin/events/${firstId}/pass-types`,
  );
  await expect(nav.getByRole('link', { name: 'Check-in' })).toHaveAttribute(
    'href',
    `/admin/events/${firstId}/check-in`,
  );
  await expect(nav.getByRole('link', { name: 'Resumen' })).not.toHaveAttribute('aria-current');

  const selector = page.getByRole('combobox', { name: 'Evento' });
  await expect(selector.getByRole('option')).toHaveText(events.map((event) => event.name));
  await expect(selector).toHaveValue(firstId);
  await selector.selectOption(secondId);
  await expect(page).toHaveURL(new RegExp(`/admin/events/${secondId}/activities$`));
  await expect(activities).toHaveAttribute('href', `/admin/events/${secondId}/activities`);
});

test('hides the event selector when no event is selected', async ({ page }) => {
  await page.goto('/admin');
  await expect(sideNav(page)).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Evento' })).toHaveCount(0);
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

test('stacks the navigation above content without horizontal overflow at 375px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/admin/events/${firstId}/activities`);
  const nav = await sideNav(page).boundingBox();
  const main = await page.getByRole('main').boundingBox();
  expect(nav).not.toBeNull();
  expect(main).not.toBeNull();
  expect(nav!.width).toBeGreaterThanOrEqual(360);
  expect(nav!.y + nav!.height).toBeLessThanOrEqual(main!.y);
  expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(
    375,
  );
});
