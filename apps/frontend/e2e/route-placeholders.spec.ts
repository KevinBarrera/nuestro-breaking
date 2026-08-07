import { expect, test } from '@playwright/test';

test('renders the admin placeholder at /admin', async ({ page }) => {
  await page.goto('/admin');

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Admin area' })).toBeVisible();
  await expect(
    page.getByText('The future administration workspace is available at /admin.'),
  ).toBeVisible();
});

test('renders the dancer placeholder at /dancer', async ({ page }) => {
  await page.goto('/dancer');

  await expect(page).toHaveURL(/\/dancer$/);
  await expect(page.getByRole('heading', { name: 'Dancer area' })).toBeVisible();
  await expect(
    page.getByText('The future dancer workspace is available at /dancer.'),
  ).toBeVisible();
});
