import { expect, test } from '@playwright/test';
import {
  adminDialogs,
  adminScreen,
  adminScreens,
  mockAdminApi,
  revealControls,
  themes,
  useTheme,
} from './support/admin-mocks.ts';
import { registrationSweepCases } from './support/registration-mocks.ts';
import { selectTrigger } from './support/select.ts';

const width = 375;

for (const theme of themes) {
  for (const screen of adminScreens) {
    test(`${screen.name} fits ${width}px in the ${theme} theme with stacked navigation`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await useTheme(page, theme);
      await mockAdminApi(page);
      await page.goto(screen.path);
      await revealControls(page, screen.name);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      const nav = await page
        .getByRole('navigation', { name: 'Navegación administrativa' })
        .boundingBox();
      const main = await page.getByRole('main').boundingBox();
      expect(nav!.y + nav!.height).toBeLessThanOrEqual(main!.y);

      // Wide tables never widen the page: each scrolls inside a box that fits the viewport.
      const tables = await page.locator('main table').evaluateAll((nodes) =>
        nodes.map((table) => {
          let box = table.parentElement;
          while (box && !['auto', 'scroll'].includes(getComputedStyle(box).overflowX))
            box = box.parentElement;
          return { boxed: !!box, right: box?.getBoundingClientRect().right ?? Infinity };
        }),
      );
      if (screen.name === 'Resumen') expect(tables.length).toBeGreaterThan(0);
      for (const table of tables) {
        expect(table.boxed).toBe(true);
        expect(table.right).toBeLessThanOrEqual(width);
      }
    });
  }
}

// Open listboxes render in a popover: at 375px it stays inside the viewport in both themes.
for (const theme of themes) {
  for (const [screen, trigger, control] of [
    [adminScreens[0], 'Evento', 'Evento'],
    [adminScreen('Listas de respaldo'), 'Lista', 'Lista'],
  ] as const) {
    test(`${screen.name} open listbox for ${control} fits ${width}px in the ${theme} theme`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await useTheme(page, theme);
      await mockAdminApi(page);
      await page.goto(screen.path);
      await revealControls(page, screen.name);
      await selectTrigger(page, trigger).click();
      const listbox = page.getByRole('listbox');
      await expect(listbox).toBeVisible();
      const box = await listbox.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    });
  }
}

// An access row with a long activity name puts its three segments under the name, inside the
// viewport, in both themes.
for (const theme of themes) {
  test(`Pase access row segments fit ${width}px in the ${theme} theme`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await useTheme(page, theme);
    await mockAdminApi(page);
    await page.goto(adminScreen('Pase').path);
    await revealControls(page, 'Pase');
    const control = page.getByRole('radiogroup', {
      name: 'Acceso a Batalla de crews con nombre largo para pantallas angostas',
    });
    for (const option of await control.getByRole('radio').all()) {
      const box = (await option.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
}

// Each catalog dialog fits a 375px screen in both themes: the dialog stays inside the
// viewport, its buttons are fully visible, and the page never scrolls sideways.
for (const theme of themes) {
  for (const dialog of adminDialogs) {
    test(`${dialog.name} dialog fits ${width}px in the ${theme} theme`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await useTheme(page, theme);
      await mockAdminApi(page);
      await page.goto(adminScreen(dialog.screen).path);
      await revealControls(page, dialog.screen);
      const open = await dialog.open(page);
      await expect(open).toBeVisible();
      const box = (await open.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(await open.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      for (const button of await open.getByRole('button').all())
        await expect(button).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    });
  }
}

// "Invitación creada" (#214): the one-time link wraps inside the card and its buttons stay
// 44px targets at 375px in both themes.
for (const theme of themes) {
  test(`Invitación creada fits ${width}px in the ${theme} theme`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await useTheme(page, theme);
    await mockAdminApi(page);
    await page.route(
      (url) => url.port === '3000' && url.pathname === '/auth/session',
      (route) =>
        route.fulfill({
          json: { user: { id: 'admin', roles: ['admin'], globalAdmin: true } },
          headers: { 'X-CSRF-Token': 'token', 'Access-Control-Expose-Headers': 'X-CSRF-Token' },
        }),
    );
    await page.route(
      (url) => url.port === '3000' && url.pathname === '/admin/team',
      (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({
              status: 201,
              json: {
                userId: 'new',
                activationUrl: `https://admin.example.org/activar-cuenta#${'f'.repeat(64)}`,
                expiresAt: '2026-11-01T00:00:00.000Z',
              },
            })
          : route.fallback(),
    );
    await page.goto(adminScreen('Agregar administrador').path);
    const form = page.getByRole('form', { name: 'Agregar administrador' });
    await form.getByLabel('Nombre').fill('Persona con un nombre largo para pantallas angostas');
    await form.getByLabel('Correo').fill('persona@example.org');
    await form.getByText('Todos los eventos', { exact: true }).click();
    await form.getByRole('button', { name: 'Crear invitación' }).click();
    await expect(page.getByRole('heading', { name: 'Invitación creada' })).toBeVisible();
    for (const control of await page.getByRole('main').getByRole('button').all()) {
      const box = (await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
}

// The registration screen in each status and the search with a pending result (#105), with a
// long participant name: the page never scrolls sideways and every control stays inside the
// viewport, in both themes.
for (const theme of themes) {
  for (const sweep of registrationSweepCases) {
    test(`${sweep.name} fits ${width}px in the ${theme} theme`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await useTheme(page, theme);
      await mockAdminApi(page);
      await sweep.mock(page);
      await page.goto(sweep.path);
      await sweep.ready(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const outside = await page
        .getByRole('main')
        .locator('a[href], button, input, textarea')
        .evaluateAll(
          (nodes, right) =>
            nodes
              .filter((node) => node.getClientRects().length > 0)
              .map((node) => ({
                name: (node.getAttribute('aria-label') ?? node.textContent ?? '')
                  .trim()
                  .slice(0, 40),
                right: node.getBoundingClientRect().right,
              }))
              .filter((node) => node.right > right),
          width,
        );
      expect(outside).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    });
  }
}
