import { expect, test } from '@playwright/test';

const organizationId = '50000000-0000-0000-0000-000000000001';
const organizationRoute = `**/api/organizations/${organizationId}/events`;

const eventOrganization = {
  organization: { id: organizationId, name: 'Local Breaking Organization' },
  events: [
    {
      id: '70000000-0000-0000-0000-000000000001',
      name: 'Local Breaking Jam',
      venue: { id: '60000000-0000-0000-0000-000000000001', name: 'Local Main Hall' },
      schedule: { startsAt: '2026-06-10T15:30:00.000Z', endsAt: null },
    },
  ],
};

test('renders the seeded organization event, venue, and schedule', async ({ page }) => {
  await page.route(organizationRoute, (route) =>
    route.fulfill({ contentType: 'application/json', json: eventOrganization }),
  );

  await page.goto('/admin');

  await expect(page.getByRole('heading', { name: 'Local Breaking Organization' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Local Breaking Jam' })).toBeVisible();
  await expect(page.getByText('Local Main Hall')).toBeVisible();
  await expect(page.getByText('2026-06-10 15:30 UTC')).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('1 event loaded');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to events' })).toBeFocused();
});

test('announces loading before the organization request resolves', async ({ page }) => {
  let releaseRequest: (() => void) | undefined;
  const requestGate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });

  await page.route(organizationRoute, async (route) => {
    await requestGate;
    await route.fulfill({ contentType: 'application/json', json: eventOrganization });
  });

  await page.goto('/admin');

  await expect(page.getByRole('status')).toHaveText('Loading event organization.');
  releaseRequest?.();
  await expect(page.getByRole('status')).toHaveText('1 event loaded');
});

test('announces an API error when the organization cannot be loaded', async ({ page }) => {
  await page.route(organizationRoute, (route) =>
    route.fulfill({
      contentType: 'application/json',
      json: { message: 'Unavailable' },
      status: 500,
    }),
  );

  await page.goto('/admin');

  await expect(page.getByRole('alert')).toHaveText('Unable to load the event organization.');
});
