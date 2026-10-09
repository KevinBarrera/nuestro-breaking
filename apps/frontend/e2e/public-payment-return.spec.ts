import { expect, test } from '@playwright/test';
import { pendingRegistration, slug } from './support/public-mocks.ts';

test.use({ viewport: { width: 390, height: 844 } });

// Mercado Pago's return (#177 D8). The URL never confirms a payment, whatever it says.
test.describe('public payment return', () => {
  test('says the payment is being confirmed even when the URL says approved', async ({ page }) => {
    const apiRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).port === '3000') apiRequests.push(request.url());
    });
    const query = new URLSearchParams({
      registration: pendingRegistration.registrationId,
      status: 'approved',
      collection_status: 'approved',
      payment_id: '123',
      external_reference: pendingRegistration.registrationId,
    });
    await page.goto(`/e/${slug}/pago?${query.toString()}`);

    await expect(
      page.getByRole('heading', { level: 1, name: 'Estamos confirmando tu pago' }),
    ).toBeVisible();
    const status = page.getByRole('status');
    await expect(status).toContainText(
      'En cuanto Mercado Pago nos avise del pago, confirmaremos tu inscripción y te enviaremos tu folio por correo.',
    );
    const main = page.getByRole('main');
    await expect(main).not.toContainText(/aprobad|confirmad|pagado/i);
    await expect(page.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute(
      'href',
      `/e/${slug}`,
    );
    expect(apiRequests).toEqual([]);
  });

  test('keeps the same claim-free message without a registration id', async ({ page }) => {
    await page.goto(`/e/${slug}/pago?status=approved`);
    await expect(page.getByRole('status')).toContainText(
      'Si hiciste un pago, en cuanto Mercado Pago nos avise confirmaremos tu inscripción',
    );
  });
});
