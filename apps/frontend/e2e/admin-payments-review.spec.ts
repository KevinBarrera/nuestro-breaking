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

const table = (page: Page) => page.getByRole('table', { name: 'Pagos por revisar' });
const bodyRows = (page: Page) => table(page).locator('tbody').getByRole('row');
const guide = (page: Page) => page.getByRole('region', { name: 'Qué hacer en cada caso' });

test('lists flagged payments in a table with what to do per reason', async ({ page }) => {
  await mockReview(page, { json: flagged });
  await page.goto(`/admin/events/${eventId}`);
  await page.getByRole('navigation').getByRole('link', { name: 'Pagos por revisar' }).click();
  await expect(page).toHaveURL(reviewPath);
  await expect(page.getByRole('heading', { level: 1, name: 'Pagos por revisar' })).toBeVisible();

  await expect(table(page).getByRole('columnheader')).toHaveText([
    'Recibido',
    'Caso',
    'Persona',
    'Inscripción',
    'Monto',
    'Pago en Mercado Pago',
  ]);
  await expect(bodyRows(page)).toHaveCount(2);
  const first = bodyRows(page).nth(0);
  await expect(first.getByRole('rowheader')).toHaveText('Pagó dos veces');
  await expect(first).toContainText('Ana López con un nombre largo para pantallas angostas');
  await expect(first).toContainText('Sin folio');
  await expect(first).toContainText('Anulada');
  await expect(first).toContainText('$1,500.00');
  await expect(first).toContainText('987654321');
  const second = bodyRows(page).nth(1);
  await expect(second.getByRole('rowheader')).toHaveText(
    'Pago de más en una inscripción confirmada',
  );
  await expect(second).toContainText('EB-0042');
  await expect(second).toContainText('Confirmada');
  await expect(second).toContainText('$990.00');

  // The action is written once per reason present, not once per row.
  const cases = guide(page).getByRole('listitem');
  await expect(cases).toHaveCount(2);
  await expect(cases.nth(0)).toContainText('Pagó dos veces (1)');
  await expect(cases.nth(0)).toContainText(
    'En Mercado Pago, reembolsa el pago que aparece en la tabla, no el de su otra inscripción, que se conserva.',
  );
  await expect(cases.nth(1)).toContainText('Pago de más en una inscripción confirmada (1)');
  await expect(cases.nth(1)).toContainText('Reembolsa este pago en Mercado Pago.');
});

test('says so when there is nothing to review', async ({ page }) => {
  await mockReview(page, { json: { payments: [] } });
  await page.goto(reviewPath);
  await expect(page.getByText('No hay pagos por revisar.')).toBeVisible();
  await expect(table(page)).toHaveCount(0);
  await expect(guide(page)).toHaveCount(0);
});

test('shows safe copy when the list cannot be read', async ({ page }) => {
  await mockReview(page, { status: 500, json: { message: 'internal detail' } });
  await page.goto(reviewPath);
  await expect(page.getByRole('alert')).toContainText('No se pudieron cargar los pagos.');
  await expect(page.getByText('internal detail')).toHaveCount(0);
});

test('fits a 375px viewport, scrolling the table inside its own box', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await mockReview(page, { json: flagged });
  await page.goto(reviewPath);
  await expect(bodyRows(page)).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
