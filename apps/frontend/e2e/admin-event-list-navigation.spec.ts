import { expect, test, type Page } from '@playwright/test';
import { mockAdminApi } from './support/admin-mocks.ts';
import {
  activeEventId,
  eventAdmin,
  mockEventList,
  mockSession,
  sampleEvents,
} from './support/event-mocks.ts';

// The way back from an event workspace to the event list (#213, found in manual testing).

const header = (page: Page) => page.getByRole('banner', { name: 'Espacio de administración' });
const sideNav = (page: Page) => page.getByRole('navigation', { name: 'Navegación administrativa' });
const allEvents = (page: Page) => sideNav(page).getByRole('link', { name: 'Todos los eventos' });
const createLink = (page: Page) =>
  page.getByRole('main').getByRole('link', { name: 'Crear evento' });

async function openOverview(page: Page) {
  await page.goto(`/admin/events/${activeEventId}`);
  await expect(page.getByRole('heading', { name: 'Resumen del evento' })).toBeVisible();
}

test('Todos los eventos goes from an event overview back to the event list', async ({ page }) => {
  await mockAdminApi(page);
  await mockEventList(page, () => sampleEvents);
  await openOverview(page);
  await expect(allEvents(page)).toHaveAttribute('href', '/admin');
  await expect(allEvents(page)).not.toHaveAttribute('aria-current');
  await allEvents(page).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(createLink(page)).toBeVisible();
  await expect(allEvents(page)).toHaveAttribute('aria-current', 'page');
  // One current item: Resumen needs an event, so it is not offered on the list.
  await expect(sideNav(page).locator('[aria-current="page"]')).toHaveCount(1);
  await expect(sideNav(page).getByRole('link', { name: 'Resumen' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
});

test('the brand goes from an event overview back to the event list', async ({ page }) => {
  await mockAdminApi(page);
  await mockEventList(page, () => sampleEvents);
  await openOverview(page);
  const brand = header(page).getByRole('link', { name: 'Los más pesados, ir a todos los eventos' });
  await expect(brand).toHaveText('LOS MÁS PESADOS');
  await brand.focus();
  await expect(brand).toHaveCSS('outline-style', 'solid');
  await brand.click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(createLink(page)).toBeVisible();
});

test('an event admin with one event sees the list when they ask for it', async ({ page }) => {
  await mockAdminApi(page);
  await mockSession(page, eventAdmin);
  await mockEventList(page, () => [sampleEvents[0]]);
  // Opening /admin directly still lands on the only event.
  await page.goto('/admin');
  await expect(page).toHaveURL(new RegExp(`/admin/events/${activeEventId}$`));
  await allEvents(page).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole('main').getByRole('link', { name: sampleEvents[0].name, exact: true }),
  ).toBeVisible();
  await expect(createLink(page)).toHaveCount(0);
});
