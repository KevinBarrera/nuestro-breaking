import { expect, test, type Page, type Route } from '@playwright/test';
import { expectSelected, selectTrigger } from './support/select.ts';

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
  await expect(header.getByText('LOS MÁS PESADOS')).toBeVisible();
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

  const selector = selectTrigger(page, 'Evento');
  await expectSelected(selector, events[0].name);
  await selector.click();
  await expect(page.getByRole('listbox').getByRole('option')).toHaveText(
    events.map((event) => event.name),
  );
  await page.getByRole('option', { name: events[1].name }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/events/${secondId}/activities$`));
  await expect(activities).toHaveAttribute('href', `/admin/events/${secondId}/activities`);
});

test('hides the event selector when no event is selected', async ({ page }) => {
  await page.goto('/admin');
  await expect(sideNav(page)).toBeVisible();
  await expect(selectTrigger(page, 'Evento')).toHaveCount(0);
});

const selectorGuardCases: {
  name: string;
  respond: (route: Route) => Promise<void>;
}[] = [
  {
    name: 'the list does not include the current event',
    respond: (route) => route.fulfill({ json: [events[1]] }),
  },
  {
    name: 'the events request fails with 500',
    respond: (route) => route.fulfill({ status: 500, json: { message: 'Server error' } }),
  },
  {
    name: 'the payload has entries without a name',
    respond: (route) => route.fulfill({ json: [{ id: firstId, title: 'Encuentro del barrio' }] }),
  },
  {
    name: 'the payload is not JSON',
    respond: (route) => route.fulfill({ contentType: 'application/json', body: '{not json' }),
  },
];

for (const { name, respond } of selectorGuardCases) {
  test(`hides the event selector on an event route when ${name}`, async ({ page }) => {
    let served = false;
    await page.route(
      (url) => api(url) && url.pathname === '/admin/events',
      async (route) => {
        await respond(route);
        served = true;
      },
    );
    await page.goto(`/admin/events/${firstId}/activities`);
    await expect.poll(() => served).toBe(true);
    await expect(sideNav(page).getByRole('link', { name: 'Actividades' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(selectTrigger(page, 'Evento')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  });
}

const fontLink = (page: Page, rel: string) =>
  page.locator(`head link[rel="${rel}"][href*="fonts.googleapis.com/css2"]`);

test('renders without the font host and loads fonts without blocking', async ({ page }) => {
  const finished: string[] = [];
  const failed: string[] = [];
  page.on('requestfinished', (request) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) finished.push(request.url());
  });
  page.on('requestfailed', (request) => {
    if (/fonts\.googleapis\.com/.test(request.url())) failed.push(request.url());
  });
  await page.goto('/admin');
  await expect(page.getByRole('banner', { name: 'Espacio de administración' })).toBeVisible();
  // The font stylesheet was really requested and blocked; the shell rendered regardless.
  await expect.poll(() => failed.length).toBeGreaterThan(0);
  await expect(fontLink(page, 'preload')).toHaveCount(1);
  await expect(fontLink(page, 'stylesheet')).toHaveCount(0);
  expect(finished).toEqual([]);
});

test('applies the font stylesheet once it loads', async ({ page }) => {
  let served = 0;
  await page.route('https://fonts.googleapis.com/css2**', (route) => {
    served++;
    return route.fulfill({ contentType: 'text/css', body: '/* event fonts */' });
  });
  await page.goto('/admin');
  await expect(page.getByRole('banner', { name: 'Espacio de administración' })).toBeVisible();
  await expect(fontLink(page, 'stylesheet')).toHaveCount(1);
  await expect(fontLink(page, 'preload')).toHaveCount(0);
  expect(served).toBeGreaterThan(0);
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
