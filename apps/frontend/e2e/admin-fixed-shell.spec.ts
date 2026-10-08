import { expect, test, type Page } from '@playwright/test';
import { adminScreens, mockAdminApi } from './support/admin-mocks.ts';

const header = (page: Page) => page.getByRole('banner', { name: 'Espacio de administración' });
const sideNav = (page: Page) => page.getByRole('navigation', { name: 'Navegación administrativa' });

// The element that scrolls the page content: the main landmark or its closest scrollable
// ancestor. Returns its scrollTop and whether it is the document itself.
const contentScroll = (page: Page) =>
  page.getByRole('main').evaluate((main) => {
    let node: HTMLElement | null = main as HTMLElement;
    while (node && node !== document.body) {
      const { overflowY } = getComputedStyle(node);
      if (['auto', 'scroll'].includes(overflowY) && node.scrollHeight > node.clientHeight)
        return { document: false, top: node.scrollTop };
      node = node.parentElement;
    }
    return { document: true, top: document.scrollingElement!.scrollTop };
  });

// Makes every page's content taller than any viewport so there is something to scroll. The
// style survives client-side navigation, so the next page is tall from its first render.
const growContent = (page: Page) =>
  page.addStyleTag({ content: 'main { padding-bottom: 3000px; }' });

const scrollContentToBottom = (page: Page) =>
  page.getByRole('main').evaluate((main) => {
    main.scrollIntoView({ block: 'end' });
    main.lastElementChild?.scrollIntoView({ block: 'end' });
    let node: HTMLElement | null = main as HTMLElement;
    while (node) {
      node.scrollTop = node.scrollHeight;
      node = node.parentElement;
    }
  });

test('keeps the header and side navigation fixed while only the content scrolls at 1280px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockAdminApi(page);
  await page.goto(adminScreens[2].path);
  await expect(page.getByRole('main')).toBeVisible();
  await growContent(page);
  const headerBefore = await header(page).boundingBox();
  const navBefore = await sideNav(page).boundingBox();

  await scrollContentToBottom(page);

  const scroll = await contentScroll(page);
  expect(scroll.document).toBe(false);
  expect(scroll.top).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  expect(await header(page).boundingBox()).toEqual(headerBefore);
  expect(await sideNav(page).boundingBox()).toEqual(navBefore);
  await expect(header(page)).toBeInViewport();
  await expect(sideNav(page).getByRole('link', { name: 'Pases' })).toBeInViewport();
  // The side navigation fills the height left under the header.
  expect(navBefore!.y + navBefore!.height).toBeCloseTo(800, 0);
});

test('resets the content scroll to the top on route change at 1280px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockAdminApi(page);
  await page.goto(adminScreens[2].path);
  await expect(page.getByRole('main')).toBeVisible();
  await growContent(page);
  await scrollContentToBottom(page);
  expect((await contentScroll(page)).top).toBeGreaterThan(0);

  await sideNav(page).getByRole('link', { name: 'Pases' }).click();
  await expect(page).toHaveURL(adminScreens[3].path);
  await expect(page.getByRole('main')).toBeVisible();
  await expect.poll(async () => (await contentScroll(page)).top).toBe(0);
  await expect(header(page)).toBeInViewport();
});

test('keeps the stacked layout without horizontal overflow at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await mockAdminApi(page);
  await page.goto(adminScreens[2].path);
  await expect(page.getByRole('main')).toBeVisible();
  await growContent(page);
  await scrollContentToBottom(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const nav = await sideNav(page).boundingBox();
  const main = await page.getByRole('main').boundingBox();
  expect(nav!.y + nav!.height).toBeLessThanOrEqual(main!.y);
});
