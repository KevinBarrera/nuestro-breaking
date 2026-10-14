import { expect, test, type Page } from '@playwright/test';
import { eventSummary } from './support/event-mocks.ts';

// "Pagos por revisar" (#230). Reason copy and response validation are covered by
// `payments-review-model.test.ts` and `readers.test.ts`; these specs check the rendered states.
const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const reviewPath = `/admin/events/${eventId}/payments-review`;
const api = (url: URL) => url.port === '3000';

const flagged = {
  payments: [
    {
      providerPaymentId: '987654321',
      reason: 'approved_after_expiry_duplicate',
      receivedAt: '2026-11-02T18:04:00.000Z',
      amountCents: 150000,
      registration: {
        id: 'c1b2c3d4-1234-4567-89ab-123456789abc',
        folio: null,
        participantName: 'Ana López con un nombre largo para pantallas angostas',
        status: 'voided',
      },
    },
    {
      providerPaymentId: '123456789',
      reason: 'approved_after_confirmation',
      receivedAt: '2026-11-01T16:30:00.000Z',
      amountCents: 99000,
      registration: {
        id: 'c2b2c3d4-1234-4567-89ab-123456789abc',
        folio: 'EB-0042',
        participantName: 'Beto Ruiz',
        status: 'confirmed',
      },
    },
  ],
};

async function mockReview(page: Page, answer: { status?: number; json: unknown }) {
  await page.route(
    (url) => api(url) && url.pathname === '/auth/session',
    (route) => route.fulfill({ json: { user: { id: 'admin', roles: ['admin'] } } }),
  );
  await page.route(
    (url) => api(url) && url.pathname === '/admin/events',
    (route) => route.fulfill({ json: [eventSummary(eventId, 'Encuentro del barrio')] }),
  );
  await page.route(
    (url) => api(url) && url.pathname === `/admin/events/${eventId}/flagged-payments`,
    (route) => route.fulfill({ status: answer.status ?? 200, json: answer.json }),
  );
}

const list = (page: Page) => page.getByRole('list', { name: 'Pagos por revisar' });

test('lists each flagged payment with its reason and what to do', async ({ page }) => {
  await mockReview(page, { json: flagged });
  await page.goto(`/admin/events/${eventId}`);
  await page.getByRole('navigation').getByRole('link', { name: 'Pagos por revisar' }).click();
  await expect(page).toHaveURL(reviewPath);
  await expect(page.getByRole('heading', { level: 1, name: 'Pagos por revisar' })).toBeVisible();

  const items = list(page).getByRole('listitem');
  await expect(items).toHaveCount(2);
  const first = items.nth(0);
  await expect(first.getByRole('heading', { name: 'Pagó dos veces' })).toBeVisible();
  await expect(first).toContainText(
    'Revisa la otra inscripción y reembolsa uno de los pagos en Mercado Pago.',
  );
  await expect(first).toContainText('Ana López con un nombre largo para pantallas angostas');
  await expect(first).toContainText('Sin folio');
  await expect(first).toContainText('Anulada');
  await expect(first).toContainText('$1,500.00');
  await expect(first).toContainText('987654321');
  const second = items.nth(1);
  await expect(
    second.getByRole('heading', { name: 'Pago de más en una inscripción confirmada' }),
  ).toBeVisible();
  await expect(second).toContainText('EB-0042');
  await expect(second).toContainText('Confirmada');
  await expect(second).toContainText('$990.00');
});

test('says so when there is nothing to review', async ({ page }) => {
  await mockReview(page, { json: { payments: [] } });
  await page.goto(reviewPath);
  await expect(page.getByText('No hay pagos por revisar.')).toBeVisible();
  await expect(list(page)).toHaveCount(0);
});

test('shows safe copy when the list cannot be read', async ({ page }) => {
  await mockReview(page, { status: 500, json: { message: 'internal detail' } });
  await page.goto(reviewPath);
  await expect(page.getByRole('alert')).toContainText('No se pudieron cargar los pagos.');
  await expect(page.getByText('internal detail')).toHaveCount(0);
});

test('fits a 375px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await mockReview(page, { json: flagged });
  await page.goto(reviewPath);
  await expect(list(page).getByRole('listitem')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
