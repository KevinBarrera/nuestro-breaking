import { expect, test } from '@playwright/test';
import {
  adminScreens,
  mockAdminApi,
  revealControls,
  themes,
  useTheme,
} from './support/admin-mocks.ts';
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
      if (screen.name === 'Resumen' || screen.name === 'Pases')
        expect(tables.length).toBeGreaterThan(0);
      for (const table of tables) {
        expect(table.boxed).toBe(true);
        expect(table.right).toBeLessThanOrEqual(width);
      }
    });
  }
}

// Open listboxes render in a popover: at 375px it stays inside the viewport in both themes.
for (const theme of themes) {
  for (const [screen, trigger] of [
    [adminScreens[0], 'Evento'],
    [adminScreens[3], 'Pase completo · Batalla de crews con nombre largo para pantallas angostas'],
  ] as const) {
    test(`${screen.name} open listbox for ${trigger.split(' · ')[0]} fits ${width}px in the ${theme} theme`, async ({
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
