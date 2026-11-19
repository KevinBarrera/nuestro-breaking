import { expect, test, type Page } from '@playwright/test';
import { eventSummary } from './support/event-mocks.ts';

// "Pagos por revisar" (#230, #340). Case copy, grouping, chips, totals and the collapse rule are
// covered by `payments-review-model.test.ts`, and response validation by `readers.test.ts`;
// these specs check the rendered states and the interactions.
const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const reviewPath = `/admin/events/${eventId}/payments-review`;
const api = (url: URL) => url.port === '3000';

type Reason =
  | 'approved_after_expiry_duplicate'
  | 'approved_after_expiry_event_ended'
  | 'approved_after_confirmation'
  | 'approved_after_void';

const flaggedPayment = (
  index: number,
  reason: Reason,
  amountCents: number,
  registration: { folio: string | null; participantName: string; status: string },
) => ({
  providerPaymentId: String(987654321 + index),
  reason,
  receivedAt: '2026-11-02T18:04:00.000Z',
  amountCents,
  registration: { id: `c${index}b2c3d4-1234-4567-89ab-123456789abc`, ...registration },
});

const flagged = {
  payments: [
    flaggedPayment(0, 'approved_after_void', 150000, {
      folio: null,
      participantName: 'Ana López con un nombre largo para pantallas angostas',
      status: 'voided',
    }),
    flaggedPayment(1, 'approved_after_confirmation', 99000, {
      folio: 'EB-0042',
      participantName: 'Beto Ruiz',
      status: 'confirmed',
    }),
    flaggedPayment(2, 'approved_after_void', 50000, {
      folio: 'EB-0050',
      participantName: 'Carla Hernández',
      status: 'voided',
    }),
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

const caseCard = (page: Page, title: string) => page.getByRole('region', { name: title });
const caseToggle = (page: Page, title: string) =>
  page.getByRole('heading', { level: 2, name: title }).getByRole('button');
const caseRows = (page: Page, title: string) =>
  caseCard(page, title)
    .getByRole('table')
    .getByRole('row')
    .filter({ has: page.getByRole('cell') });
const chip = (page: Page, name: RegExp) =>
  page.getByRole('group', { name: 'Filtrar por caso' }).getByRole('button', { name });

test('groups flagged payments by case, each with what to do and its table', async ({ page }) => {
  await mockReview(page, { json: flagged });
  await page.goto(`/admin/events/${eventId}`);
  await page.getByRole('navigation').getByRole('link', { name: 'Pagos por revisar' }).click();
  await expect(page).toHaveURL(reviewPath);
  await expect(page.getByRole('heading', { level: 1, name: 'Pagos por revisar' })).toBeVisible();
  await expect(page.getByText('Esta pantalla solo informa.')).toBeVisible();

  const totals = page.getByRole('definition');
  await expect(totals).toHaveText(['3', '$2,990.00']);

  // Fixed case order: the overpayment comes before the voided registration.
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    /^Pago de más en una inscripción confirmada/,
    /^Pagó una inscripción anulada/,
  ]);

  const voided = caseCard(page, 'Pagó una inscripción anulada');
  await expect(caseToggle(page, 'Pagó una inscripción anulada')).toContainText('2 pagos');
  await expect(caseToggle(page, 'Pagó una inscripción anulada')).toContainText('$2,000.00');
  await expect(voided).toContainText('La inscripción se anuló antes de que llegara el pago.');
  await expect(voided).toContainText(
    'Decide con coordinación si la persona se inscribe de nuevo o si reembolsas el pago en Mercado Pago.',
  );
  await expect(voided.getByRole('columnheader')).toHaveText([
    'Persona',
    'Inscripción',
    'Recibido',
    'Monto',
    'Pago en Mercado Pago',
  ]);
  const rows = caseRows(page, 'Pagó una inscripción anulada');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Ana López con un nombre largo para pantallas angostas');
  await expect(rows.nth(0)).toContainText('Sin folio');
  await expect(rows.nth(0)).toContainText('Anulada');
  await expect(rows.nth(0)).toContainText('$1,500.00');
  await expect(rows.nth(0)).toContainText('987654321');

  const overpaid = caseRows(page, 'Pago de más en una inscripción confirmada');
  await expect(overpaid).toHaveCount(1);
  await expect(overpaid).toContainText('EB-0042');
  await expect(overpaid).toContainText('Confirmada');
  await expect(caseCard(page, 'Pago de más en una inscripción confirmada')).toContainText(
    'Reembolsa este pago en Mercado Pago.',
  );
});

test('filters by case with the chips', async ({ page }) => {
  await mockReview(page, { json: flagged });
  await page.goto(reviewPath);

  await expect(
    page.getByRole('group', { name: 'Filtrar por caso' }).getByRole('button'),
  ).toHaveText(['Todos los casos3', 'Pago de más1', 'Inscripción anulada2']);
  await expect(chip(page, /^Todos los casos/)).toHaveAttribute('aria-pressed', 'true');

  await chip(page, /^Inscripción anulada/).click();
  await expect(chip(page, /^Inscripción anulada/)).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page, /^Todos los casos/)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    /^Pagó una inscripción anulada/,
  ]);
  // A single case needs no open-all control.
  await expect(page.getByRole('button', { name: /todos los casos$/ })).toHaveCount(0);

  await chip(page, /^Todos los casos/).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(2);
});

test('opens and closes cases one by one or all at once', async ({ page }) => {
  await mockReview(page, { json: flagged });
  await page.goto(reviewPath);

  const toggle = caseToggle(page, 'Pagó una inscripción anulada');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(caseCard(page, 'Pagó una inscripción anulada').getByRole('table')).toHaveCount(0);

  await page.getByRole('button', { name: 'Abrir todos los casos' }).click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Cerrar todos los casos' }).click();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Abrir todos los casos' })).toBeVisible();
});

test('starts with the cases closed when there are more than 8 payments', async ({ page }) => {
  const many = Array.from({ length: 9 }, (_, index) =>
    flaggedPayment(index, index % 2 ? 'approved_after_void' : 'approved_after_confirmation', 1000, {
      folio: `EB-00${10 + index}`,
      participantName: `Persona ${index + 1}`,
      status: 'confirmed',
    }),
  );
  await mockReview(page, { json: { payments: many } });
  await page.goto(reviewPath);

  await expect(caseToggle(page, 'Pagó una inscripción anulada')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(page.getByRole('table')).toHaveCount(0);
  await caseToggle(page, 'Pagó una inscripción anulada').click();
  await expect(caseRows(page, 'Pagó una inscripción anulada')).toHaveCount(4);
});

test('copies a Mercado Pago payment number and announces it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockReview(page, { json: flagged });
  await page.goto(reviewPath);

  await page.getByRole('button', { name: 'Copiar número de pago 987654322' }).click();
  await expect(
    page.getByRole('button', { name: 'Número de pago 987654322 copiado' }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Número de pago 987654322 copiado.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('987654322');
});

test('says all is in order when there is nothing to review', async ({ page }) => {
  await mockReview(page, { json: { payments: [] } });
  await page.goto(reviewPath);
  await expect(page.getByRole('heading', { level: 2, name: 'Todo en orden' })).toBeVisible();
  await expect(
    page.getByText(
      'No hay pagos por revisar. Si un pago de Mercado Pago no se puede aplicar solo, aparece aquí con lo que debes hacer.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('group', { name: 'Filtrar por caso' })).toHaveCount(0);
  await expect(page.getByRole('definition')).toHaveCount(0);
});

test('shows safe copy when the list cannot be read', async ({ page }) => {
  await mockReview(page, { status: 500, json: { message: 'internal detail' } });
  await page.goto(reviewPath);
  await expect(page.getByRole('alert')).toContainText('No se pudieron cargar los pagos.');
  await expect(page.getByText('internal detail')).toHaveCount(0);
});

test('fits a 375px viewport, with each row labeled', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await mockReview(page, { json: flagged });
  await page.goto(reviewPath);
  const rows = caseRows(page, 'Pagó una inscripción anulada');
  await expect(rows).toHaveCount(2);
  await expect(page.getByRole('columnheader')).toHaveCount(0);
  await expect(rows.nth(0).getByText('Pago en Mercado Pago')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
