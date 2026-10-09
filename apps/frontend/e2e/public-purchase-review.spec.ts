import { expect, test, type Page } from '@playwright/test';
import {
  addApiSessionCookie,
  catalogReply,
  checkoutReply,
  draftKey,
  fakeCheckoutUrl,
  mockCheckout,
  mockPublicCatalog,
  mockRegistration,
  registrationReply,
  pendingRegistration,
  slug,
} from './support/public-mocks.ts';

// Phone first; the desktop check sets its own viewport.
test.use({ viewport: { width: 390, height: 844 } });

const home = `/e/${slug}`;
const step = (name: 'pases' | 'competencias' | 'datos' | 'revisar') => `/e/${slug}/${name}`;
const checkoutPath = `/public/events/${slug}/registrations/${pendingRegistration.registrationId}/checkout`;

const overlapNotice =
  'Algunas competencias o workshops pueden coincidir en horario. Puedes elegir libremente a cuáles asistir; intentaremos evitar cruces entre competencias, pero no podemos garantizarlos. Open Styles no coincidirá con competencias de pase completo, aunque podría coincidir parcialmente con workshops.';

const legal = [/Reglamento oficial/, /Aviso de privacidad/, /Política de cancelación/] as const;

const payButton = (page: Page) => page.getByRole('button', { name: /^Pagar .* con Mercado Pago$/ });

async function acceptLegal(page: Page) {
  for (const name of legal) await page.getByRole('checkbox', { name }).check();
}

// A saved draft (Pase completo Breaking with Bboy and 3v3, plus Open Styles) so a spec can start
// on revisar. Seeded once per tab, so a reload after paying does not bring it back.
async function seedDraft(page: Page, buyer: Record<string, string> = {}) {
  const draft = JSON.stringify({
    version: 1,
    selection: {
      passTypeIds: ['breaking', 'open-styles'],
      selectedActivityIds: { breaking: ['breaking-0', 'breaking-2'] },
    },
    buyer: {
      firstName: 'Ana',
      firstLastName: 'López',
      stageName: 'B-girl Ana',
      email: 'ana@ejemplo.com',
      phone: '33 1234 5678',
      ...buyer,
    },
  });
  await page.addInitScript(
    ([key, value]) => {
      if (sessionStorage.getItem('nb-test-seeded')) return;
      sessionStorage.setItem('nb-test-seeded', '1');
      sessionStorage.setItem(key, value);
    },
    [draftKey, draft],
  );
}

test.describe('public review and pay', () => {
  test('goes from the home to the Mercado Pago checkout without credentials', async ({
    page,
    context,
  }) => {
    await addApiSessionCookie(context);
    await mockPublicCatalog(page, catalogReply());
    const registration = await mockRegistration(page, registrationReply());
    const checkout = await mockCheckout(page, checkoutReply());

    await page.goto(home);
    await page.getByRole('link', { name: 'Comprar pases' }).click();
    await page.getByRole('checkbox', { name: /Pase completo Breaking/ }).check();
    await page.getByRole('checkbox', { name: /Open Styles/ }).check();
    await page
      .getByRole('region', { name: 'Resumen de tu compra' })
      .getByRole('button', { name: 'Continuar' })
      .click();
    await page.getByRole('button', { name: 'Breaking Bboy' }).click();
    await page.getByRole('button', { name: 'Breaking 3v3' }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByLabel('Nombre(s)').fill('Ana');
    await page.getByLabel('Primer apellido').fill('López');
    await page.getByLabel(/^AKA/).fill('B-girl Ana');
    await page.getByLabel('Correo electrónico').fill('ana@ejemplo.com');
    await page.getByLabel('Teléfono celular').fill('33 1234 5678');
    await page.getByRole('button', { name: 'Revisar compra' }).click();

    await expect(page).toHaveURL(step('revisar'));
    await expect(page.getByText('Paso 4 de 4')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Revisa y paga' })).toBeVisible();
    const passes = page.getByRole('region', { name: 'Tus pases' });
    await expect(passes).toContainText('Pase completo Breaking');
    await expect(passes).toContainText('Breaking Bboy, Breaking 3v3');
    await expect(passes).toContainText('Open Styles 1vs1');
    await expect(passes).toContainText(/Total\s*\$2,800\.00 MXN/);
    await expect(passes.getByRole('link', { name: 'Cambiar pases' })).toHaveAttribute(
      'href',
      step('pases'),
    );
    const buyer = page.getByRole('region', { name: 'Tus datos' });
    await expect(buyer).toContainText('Ana López · B-girl Ana');
    await expect(buyer).toContainText('ana@ejemplo.com · +52 33 1234 5678');
    await expect(buyer.getByRole('link', { name: 'Cambiar datos' })).toHaveAttribute(
      'href',
      step('datos'),
    );
    await expect(page.getByRole('note')).toHaveText(overlapNotice);
    await expect(page.getByRole('group', { name: 'Documentos y políticas' })).toBeVisible();
    await expect(
      page.getByText(
        'Te llevaremos a Mercado Pago para pagar de forma segura y después volverás aquí.',
      ),
    ).toBeVisible();

    // Pay stays disabled, with the reason, until the three documents are accepted.
    await expect(payButton(page)).toHaveText('Pagar $2,800.00 con Mercado Pago');
    for (const name of legal) {
      await expect(payButton(page)).toBeDisabled();
      await expect(payButton(page)).toHaveAccessibleDescription(
        'Marca las tres casillas para poder pagar.',
      );
      await page.getByRole('checkbox', { name }).check();
    }
    await expect(payButton(page)).toBeEnabled();

    // Pending: a second click cannot send a second request.
    registration.hold();
    await payButton(page).click();
    const pending = page.getByRole('button', { name: 'Te estamos llevando a Mercado Pago…' });
    await expect(pending).toBeDisabled();
    await pending.click({ force: true });
    registration.release();

    // A full page load to Mercado Pago's hosted page.
    await expect(page).toHaveURL(fakeCheckoutUrl);
    expect(registration.requests).toHaveLength(1);
    expect(checkout.requests).toHaveLength(1);
    expect(new URL(checkout.requests[0].url()).pathname).toBe(checkoutPath);
    expect(checkout.requests[0].method()).toBe('POST');
    const request = registration.requests[0];
    expect(request.postDataJSON()).toEqual({
      buyer: {
        firstName: 'Ana',
        firstLastName: 'López',
        stageName: 'B-girl Ana',
        email: 'ana@ejemplo.com',
        phone: '+52 3312345678',
      },
      passes: [
        { passTypeId: 'breaking', selectedActivityIds: ['breaking-0', 'breaking-2'] },
        { passTypeId: 'open-styles' },
      ],
    });
    for (const sent of [request, checkout.requests[0]]) {
      const headers = await sent.allHeaders();
      expect(headers.cookie).toBeUndefined();
      expect(headers['x-csrf-token']).toBeUndefined();
    }

    // A new purchase starts empty.
    await page.goto(step('revisar'));
    await expect(page).toHaveURL(step('pases'));
  });

  test('retries only the checkout when Mercado Pago is unavailable', async ({ page }) => {
    await seedDraft(page);
    await mockPublicCatalog(page, catalogReply());
    const registration = await mockRegistration(page, registrationReply());
    const checkout = await mockCheckout(page, {
      status: 502,
      json: { statusCode: 502, code: 'payment_provider_unavailable' },
    });
    await page.goto(step('revisar'));
    await acceptLegal(page);
    await payButton(page).click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Mercado Pago no respondió. Intenta de nuevo en un momento.');
    await expect(alert).toContainText('No se hizo ningún cargo.');
    await expect(page).toHaveURL(step('revisar'));
    expect(await page.evaluate((key) => sessionStorage.getItem(key), draftKey)).toMatch(
      /ana@ejemplo\.com/,
    );

    checkout.answer(checkoutReply());
    await alert.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page).toHaveURL(fakeCheckoutUrl);
    expect(registration.requests).toHaveLength(1);
    expect(checkout.requests).toHaveLength(2);
  });

  test('never follows a checkout URL that is not https', async ({ page }) => {
    await seedDraft(page);
    await mockPublicCatalog(page, catalogReply());
    const registration = await mockRegistration(page, registrationReply());
    const checkout = await mockCheckout(page, checkoutReply('http://example.test/x'));
    await page.goto(step('revisar'));
    await acceptLegal(page);
    await payButton(page).click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText(
      'No pudimos abrir Mercado Pago. Revisa tu conexión e intenta de nuevo.',
    );
    await expect(page).toHaveURL(step('revisar'));
    await expect(payButton(page)).toBeEnabled();

    // The retry asks for a new checkout only, and a valid URL is followed.
    checkout.answer(checkoutReply());
    await alert.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page).toHaveURL(fakeCheckoutUrl);
    expect(registration.requests).toHaveLength(1);
    expect(checkout.requests).toHaveLength(2);
  });

  test('starts over with a new registration when it can no longer be paid', async ({ page }) => {
    await seedDraft(page);
    await mockPublicCatalog(page, catalogReply());
    const registration = await mockRegistration(page, registrationReply());
    const checkout = await mockCheckout(page, {
      status: 409,
      json: { statusCode: 409, code: 'registration_not_payable' },
    });
    await page.goto(step('revisar'));
    await acceptLegal(page);
    await payButton(page).click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Esta inscripción ya no se puede pagar en línea.');
    await expect(alert.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
    await expect(alert).not.toContainText('No se hizo ningún cargo.');

    checkout.answer(checkoutReply());
    await payButton(page).click();
    await expect(page).toHaveURL(fakeCheckoutUrl);
    expect(registration.requests).toHaveLength(2);
    expect(checkout.requests).toHaveLength(2);
  });

  test('enables Pagar again when Back restores the page from the cache', async ({ page }) => {
    await seedDraft(page);
    await mockPublicCatalog(page, catalogReply());
    await mockRegistration(page, registrationReply());
    const checkout = await mockCheckout(page, checkoutReply());
    await page.goto(step('revisar'));
    await acceptLegal(page);

    // The checkout never answers, so the page stays on the pending state it had when it left.
    checkout.hold();
    await payButton(page).click();
    const pending = page.getByRole('button', { name: 'Te estamos llevando a Mercado Pago…' });
    await expect(pending).toBeDisabled();
    await expect.poll(() => checkout.requests.length).toBe(1);

    // Real back/forward cache restores are unreliable in Playwright, so fire the event it sends.
    await page.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
    );
    await expect(payButton(page)).toBeEnabled();
    await expect(pending).toHaveCount(0);
  });

  test('no longer has the temporary reserved screen', async ({ page }) => {
    await page.goto(`/e/${slug}/reservada`);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  });

  test('sends review back to datos when the saved buyer data is not valid', async ({ page }) => {
    await seedDraft(page, { email: 'ana@' });
    await mockPublicCatalog(page, catalogReply());
    await page.goto(step('revisar'));
    await expect(page).toHaveURL(step('datos'));
  });

  const failures = [
    {
      kind: '400 buyer field errors',
      reply: {
        status: 400,
        json: {
          statusCode: 400,
          fieldErrors: { 'buyer.email': 'invalid', 'buyer.phone': 'invalid' },
        },
      },
      message: 'Correo electrónico: Escribe un correo válido, por ejemplo nombre@correo.com.',
      fix: { name: 'Corregir mis datos', href: step('datos') },
    },
    {
      kind: '409 rule',
      reply: { status: 409, json: { statusCode: 409, code: 'selection_unavailable' } },
      message: 'Una de tus competencias ya no está disponible. Vuelve a elegir tus competencias.',
      fix: { name: 'Cambiar mis competencias', href: step('competencias') },
    },
    {
      kind: '409 unavailable',
      reply: { status: 409, json: { statusCode: 409, code: 'registration_unavailable' } },
      message: 'No podemos completar esta inscripción en línea. Comunícate con la organización.',
      fix: null,
    },
    {
      kind: 'sales closed',
      reply: { status: 409, json: { statusCode: 409, reason: 'ended' } },
      message: 'La venta en línea ya terminó.',
      fix: { name: 'Volver al inicio', href: home },
    },
    {
      kind: '429',
      reply: { status: 429, json: { statusCode: 429 } },
      message: 'Demasiados intentos, espera un momento e intenta de nuevo.',
      fix: null,
    },
    {
      kind: '500',
      reply: { status: 500, json: { statusCode: 500 } },
      message: 'No pudimos completar la solicitud. Revisa tu conexión e intenta de nuevo.',
      fix: null,
    },
  ];

  for (const failure of failures) {
    test(`shows the ${failure.kind} failure and keeps the purchase`, async ({ page }) => {
      await seedDraft(page);
      await mockPublicCatalog(page, catalogReply());
      const registration = await mockRegistration(page, failure.reply);
      await mockCheckout(page, checkoutReply());
      await page.goto(step('revisar'));
      await acceptLegal(page);
      await payButton(page).click();

      const alert = page.getByRole('alert');
      await expect(alert).toContainText(failure.message);
      if (failure.fix)
        await expect(alert.getByRole('link', { name: failure.fix.name })).toHaveAttribute(
          'href',
          failure.fix.href,
        );
      await expect(page).toHaveURL(step('revisar'));
      expect(await page.evaluate((key) => sessionStorage.getItem(key), draftKey)).toMatch(
        /ana@ejemplo\.com/,
      );

      // Retrying is possible from the same screen.
      registration.answer(registrationReply());
      await payButton(page).click();
      await expect(page).toHaveURL(fakeCheckoutUrl);
    });
  }

  test('lets the buyer retry after a dropped connection', async ({ page }) => {
    await seedDraft(page);
    await mockPublicCatalog(page, catalogReply());
    const registration = await mockRegistration(page, 'network-error');
    await mockCheckout(page, checkoutReply());
    await page.goto(step('revisar'));
    await acceptLegal(page);
    await payButton(page).click();
    await expect(page.getByRole('alert')).toContainText(
      'No pudimos completar la solicitud. Revisa tu conexión e intenta de nuevo.',
    );
    registration.answer(registrationReply());
    await payButton(page).click();
    await expect(page).toHaveURL(fakeCheckoutUrl);
    expect(registration.requests).toHaveLength(2);
  });

  test('lays the review out for a 1280px desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedDraft(page);
    await mockPublicCatalog(page, catalogReply());
    await page.goto(step('revisar'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      1280,
    );
    const main = await page.getByRole('main').boundingBox();
    const passes = await page.getByRole('region', { name: 'Tus pases' }).boundingBox();
    // The content keeps a readable column instead of stretching across the screen.
    expect(passes!.width).toBeLessThanOrEqual(800);
    expect(passes!.x).toBeGreaterThan(main!.x);
    await expect(payButton(page)).toBeVisible();
  });
});
