import { expect, test, type Page } from '@playwright/test';
import { adminScreens, mockAdminApi, themes, useTheme } from './support/admin-mocks.ts';

// Overscrolling past either end of a page shows the document canvas, not the shell. While a
// themed frame (admin shell, public frame) is on screen, html paints the same themed page
// background, and overscroll does not bounce, so no flat band of another color shows.
const documentBackground = (page: Page) =>
  page.evaluate(() => {
    const html = getComputedStyle(document.documentElement);
    const frame = document.querySelector('.bg-page');
    return {
      html: html.backgroundImage,
      frame: frame ? getComputedStyle(frame).backgroundImage : null,
      overscroll: html.overscrollBehaviorY,
    };
  });

for (const theme of themes)
  test(`the ${theme} admin document paints the themed page background`, async ({ page }) => {
    await useTheme(page, theme);
    await mockAdminApi(page);
    await page.goto(adminScreens[0].path);
    await expect(page.getByRole('main')).toBeVisible();
    const background = await documentBackground(page);
    expect(background.frame).toContain('linear-gradient');
    expect(background.html).toBe(background.frame);
    expect(background.overscroll).toBe('none');
  });

// Screens without a themed frame (sign-in, not found) keep the fixed dark background that
// their cream text is designed for.
test('a screen without a themed frame keeps the dark document background', async ({ page }) => {
  await page.goto('/ruta-que-no-existe');
  await expect(page.getByRole('main')).toBeVisible();
  const background = await documentBackground(page);
  expect(background.frame).toBeNull();
  const body = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
  expect(body).toContain('rgb(5, 5, 5)');
});
