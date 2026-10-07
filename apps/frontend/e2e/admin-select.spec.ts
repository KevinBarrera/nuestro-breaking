import { expect, test, type Page } from '@playwright/test';
import { adminScreens, eventId, mockAdminApi, revealControls } from './support/admin-mocks.ts';
import { exposedNativeSelects, selectTrigger } from './support/select.ts';

const otherId = 'b1b2c3d4-1234-4567-89ab-123456789abc';
const api = (url: URL) => url.port === '3000';

async function mockTwoEvents(page: Page) {
  await mockAdminApi(page);
  await page.route(
    (url) => api(url) && url.pathname === '/admin/events',
    (route) =>
      route.fulfill({
        json: [
          { id: eventId, name: 'Encuentro del barrio' },
          { id: otherId, name: 'Batalla de otoño' },
        ],
      }),
  );
}

const listboxTriggers = (page: Page) => page.locator('button[aria-haspopup="listbox"]');

test('admin screens and catalog forms expose no native select', async ({ page }) => {
  await mockAdminApi(page);
  for (const screen of adminScreens) {
    await page.goto(screen.path);
    await revealControls(page, screen.name);
    // The topbar event selector is on every event screen.
    await expect(listboxTriggers(page).first()).toBeVisible();
    expect(await exposedNativeSelects(page), screen.name).toBe(0);
  }

  await page.goto(adminScreens[2].path);
  await page.getByRole('button', { name: 'Nueva actividad' }).click();
  const activityForm = page.getByRole('form', { name: 'Nueva actividad' });
  await expect(selectTrigger(activityForm, 'Sede')).toBeVisible();
  expect(await exposedNativeSelects(page)).toBe(0);

  await page.goto(adminScreens[3].path);
  await page.getByRole('button', { name: 'Nuevo pase' }).click();
  const passForm = page.getByRole('form', { name: 'Nuevo pase' });
  await passForm.getByRole('radio', { name: 'Adicional' }).check();
  await expect(selectTrigger(passForm, 'Requiere pase')).toBeVisible();
  expect(await exposedNativeSelects(page)).toBe(0);
});

for (const key of ['Enter', 'ArrowDown'] as const) {
  test(`the topbar event selector opens with ${key} and navigates on choice`, async ({ page }) => {
    await mockTwoEvents(page);
    await page.goto(`/admin/events/${eventId}/activities`);
    const header = page.getByRole('banner', { name: 'Espacio de administración' });
    const trigger = selectTrigger(header, 'Evento');
    await expect(trigger).toContainText('Encuentro del barrio');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.focus();
    await page.keyboard.press(key);
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(listbox.getByRole('option')).toHaveText([
      'Encuentro del barrio',
      'Batalla de otoño',
    ]);
    await expect(listbox.getByRole('option', { name: 'Encuentro del barrio' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(listbox.getByRole('option', { name: 'Batalla de otoño' })).toHaveAttribute(
      'aria-selected',
      'false',
    );

    // Keyboard choice: move to the other event and confirm it.
    await expect(listbox.getByRole('option', { name: 'Encuentro del barrio' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(listbox.getByRole('option', { name: 'Batalla de otoño' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(listbox).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/admin/events/${otherId}/activities$`));
    await expect(trigger).toContainText('Batalla de otoño');
  });
}

test('choosing the current event again does not navigate', async ({ page }) => {
  await mockTwoEvents(page);
  await page.goto(`/admin/events/${eventId}/pass-types`);
  const header = page.getByRole('banner', { name: 'Espacio de administración' });
  const trigger = selectTrigger(header, 'Evento');
  await trigger.click();
  await page.getByRole('option', { name: 'Encuentro del barrio' }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/admin/events/${eventId}/pass-types$`));
  await expect(trigger).toBeFocused();
});
