import { expect, test, type Page } from '@playwright/test';
import {
  checkoutReply,
  fakeCheckoutUrl,
  mockCheckout,
  mockPaymentStatus,
  paymentStatusReply,
  pendingRegistration,
  slug,
} from './support/public-mocks.ts';

test.use({ viewport: { width: 390, height: 844 } });

const registrationId = pendingRegistration.registrationId;
const returnPath = `/e/${slug}/pago?registration=${registrationId}`;
const heading = (page: Page, name: string) => page.getByRole('heading', { level: 1, name });

// Mercado Pago's return (#177 D8, #178). The URL never confirms a payment, whatever it says: the
// page polls the payment status endpoint and shows only what it answers.
test.describe('public payment return', () => {
  test('keeps confirming while the API says so, then shows the confirmed registration', async ({
    page,
  }) => {
    await page.clock.install();
    const status = await mockPaymentStatus(page, paymentStatusReply('confirming'));
    const query = new URLSearchParams({
      registration: registrationId,
      status: 'approved',
      collection_status: 'approved',
      payment_id: '123',
    });
    await page.goto(`/e/${slug}/pago?${query.toString()}`);

    await expect(heading(page, 'Estamos confirmando tu pago')).toBeVisible();
    const main = page.getByRole('main');
    await expect(main).toContainText('te enviaremos el resultado a a***@ejemplo.com');
    await expect(main).not.toContainText(/aprobad|confirmada|pagado/i);
    // The clock runs at real speed, so a slow runner may already have polled again.
    await expect.poll(() => status.requests.length).toBeGreaterThanOrEqual(1);
    const request = status.requests[0];
    expect(new URL(request.url()).pathname).toBe(
      `/public/events/${slug}/registrations/${registrationId}/payment-status`,
    );
    expect(request.headers()['cookie']).toBeUndefined();

    status.answer(paymentStatusReply('confirmed'));
    await page.clock.fastForward(3_000);

    const confirmed = heading(page, '¡Listo, Ana! Tu inscripción está confirmada');
    await expect(confirmed).toBeFocused();
    await expect(page.getByRole('status')).toContainText('Pago aprobado');
    await expect(main).toContainText('Tu folio');
    await expect(main).toContainText('LMP-0427');
    await expect(main).toContainText('Competencias: Breaking Bboy, Breaking 3v3');
    await expect(main).toContainText('$2,800.00 MXN');
    await expect(main).toContainText('Enviamos esta confirmación a a***@ejemplo.com.');
    await expect(page.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute(
      'href',
      `/e/${slug}`,
    );

    // A confirmed answer ends the polling.
    const asked = status.requests.length;
    await page.clock.fastForward(10_000);
    expect(status.requests.length).toBe(asked);
  });

  test('explains a pending OXXO or SPEI payment', async ({ page }) => {
    await mockPaymentStatus(page, paymentStatusReply('pending'));
    await page.goto(returnPath);

    await expect(heading(page, 'Falta que se complete tu pago')).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Pago pendiente');
    const steps = page.getByRole('main').getByRole('listitem');
    await expect(steps).toHaveCount(2);
    await expect(steps.nth(1)).toContainText(
      'Cuando se acredite, te enviaremos tu confirmación y tu folio a a***@ejemplo.com.',
    );
    await expect(page.getByRole('main')).not.toContainText('LMP-');
  });

  test('offers a new checkout for the same registration after a rejection', async ({ page }) => {
    await mockPaymentStatus(page, paymentStatusReply('rejected'));
    const checkout = await mockCheckout(page, checkoutReply());
    await page.goto(returnPath);

    await expect(heading(page, 'No se pudo completar tu pago')).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Pago no aprobado');
    await expect(page.getByRole('main')).not.toContainText('Escríbenos');

    checkout.hold();
    const retry = page.getByRole('button', { name: 'Intentar de nuevo' });
    await retry.click();
    await expect(
      page.getByRole('button', { name: 'Te estamos llevando a Mercado Pago…' }),
    ).toBeDisabled();
    checkout.release();

    await page.waitForURL(fakeCheckoutUrl);
    expect(checkout.requests).toHaveLength(1);
    expect(new URL(checkout.requests[0].url()).pathname).toBe(
      `/public/events/${slug}/registrations/${registrationId}/checkout`,
    );
  });

  test('shows why the retry failed when sales have closed', async ({ page }) => {
    await mockPaymentStatus(page, paymentStatusReply('rejected'));
    await mockCheckout(page, { status: 409, json: { reason: 'ended' } });
    await page.goto(returnPath);

    await page.getByRole('button', { name: 'Intentar de nuevo' }).click();
    await expect(page.getByRole('alert')).toContainText('La venta en línea ya terminó');
    await expect(page.getByRole('button', { name: 'Intentar de nuevo' })).toBeHidden();
    await expect(page.getByRole('link', { name: 'Volver al inicio' })).toBeVisible();
  });

  test('says it is taking longer after the bounded polling, and checks again', async ({ page }) => {
    await page.clock.install();
    const status = await mockPaymentStatus(page, paymentStatusReply('confirming'));
    await page.goto(returnPath);

    // 20 tries, 3 s apart (D7). Each step jumps the clock until the next request goes out.
    for (let tries = 1; tries <= 20; tries += 1)
      await expect
        .poll(async () => {
          if (status.requests.length < tries) await page.clock.fastForward(3_000);
          return status.requests.length;
        })
        .toBeGreaterThanOrEqual(tries);

    const takingLonger = heading(page, 'Tu pago está tardando más de lo normal');
    await expect(takingLonger).toBeFocused();
    await expect(page.getByRole('main')).toContainText('a***@ejemplo.com');
    await page.clock.fastForward(30_000);
    expect(status.requests).toHaveLength(20);

    status.answer(paymentStatusReply('confirmed'));
    await page.getByRole('button', { name: 'Revisar de nuevo' }).click();
    await expect(heading(page, '¡Listo, Ana! Tu inscripción está confirmada')).toBeVisible();
    expect(status.requests).toHaveLength(21);
  });

  test('says it is taking longer when the connection fails', async ({ page }) => {
    await mockPaymentStatus(page, 'network-error');
    await page.goto(returnPath);

    await expect(heading(page, 'Tu pago está tardando más de lo normal')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Revisar de nuevo' })).toBeVisible();
  });

  test('shows a neutral message for an unknown or voided registration', async ({ page }) => {
    const status = await mockPaymentStatus(page, { status: 404, json: { statusCode: 404 } });
    await page.goto(returnPath);
    const unavailable = heading(page, 'No podemos mostrar este pago');
    await expect(unavailable).toBeVisible();
    await expect(page.getByRole('main')).not.toContainText(/Ana|a\*\*\*/);

    status.answer(paymentStatusReply('unavailable'));
    await page.reload();
    await expect(unavailable).toBeVisible();
    await expect(page.getByRole('main')).not.toContainText(/Ana|a\*\*\*|LMP-/);
    await expect(page.getByRole('link', { name: 'Volver al inicio' })).toBeVisible();
  });

  test('keeps the claim-free message without a registration id', async ({ page }) => {
    const apiRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).port === '3000') apiRequests.push(request.url());
    });
    await page.goto(`/e/${slug}/pago?status=approved`);
    await expect(page.getByRole('status')).toContainText(
      'Si hiciste un pago, en cuanto Mercado Pago nos avise confirmaremos tu inscripción',
    );
    expect(apiRequests).toEqual([]);
  });
});
