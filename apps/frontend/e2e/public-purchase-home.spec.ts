import { expect, test, type Locator, type Page } from '@playwright/test';
import { themes, useTheme } from './support/admin-mocks.ts';
import {
  addApiSessionCookie,
  catalogReply,
  closedCatalog,
  draftKey,
  eventName,
  mockPublicCatalog,
  slug,
} from './support/public-mocks.ts';

const home = `/e/${slug}`;
// Phone first; the desktop test sets its own viewport.
test.use({ viewport: { width: 390, height: 844 } });
const passes = `/e/${slug}/pases`;

const pass = (page: Page, name: string) => page.getByRole('checkbox', { name: new RegExp(name) });
const bottomBar = (page: Page) => page.getByRole('region', { name: 'Resumen de tu compra' });

async function expectFitsAndTargets(page: Page, width: number, targets: Locator) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
  for (const target of await targets.all()) {
    if (!(await target.isVisible())) continue;
    const box = await target.boundingBox();
    expect(box!.height, (await target.textContent()) ?? '').toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  }
}

test.describe('public home', () => {
  test('shows the open event with its passes and asks the API without credentials', async ({
    page,
    context,
  }) => {
    await addApiSessionCookie(context);
    const { requests } = await mockPublicCatalog(page, catalogReply());
    await page.goto(home);

    await expect(page.getByRole('heading', { level: 1, name: eventName })).toBeVisible();
    await expect(page.getByText('Sábado 21 de noviembre – Domingo 22 de noviembre')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Comprar pases' })).toHaveAttribute('href', passes);
    const list = page.getByRole('region', { name: 'Pases' });
    await expect(list.getByText('Pase completo Breaking')).toBeVisible();
    await expect(list.getByText('Open Styles', { exact: true })).toBeVisible();
    await expect(list.getByText('$2,000.00').first()).toBeVisible();
    await expect(list.getByText('$800.00')).toBeVisible();
    await expect(
      page.getByText('Pagas de forma segura en Mercado Pago. Precios en pesos mexicanos.'),
    ).toBeVisible();
    for (const name of ['Reglamento', 'Aviso de privacidad', 'Política de cancelación'])
      await expect(page.getByRole('contentinfo').getByRole('link', { name })).toBeVisible();

    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      const headers = await request.allHeaders();
      expect(headers.cookie).toBeUndefined();
      expect(headers['x-csrf-token']).toBeUndefined();
    }
  });

  test('says when closed sales open, or that they are closed, without a buy button', async ({
    page,
  }) => {
    const catalog = await mockPublicCatalog(
      page,
      catalogReply(closedCatalog('not_yet_open', '2026-10-15T15:00:00.000Z')),
    );
    await page.goto(home);
    // The event clock (Mexico City), whatever the browser zone.
    await expect(page.getByText(/^La venta abre el 15 oct 2026, 09:00$/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Comprar pases' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Pases' })).toHaveCount(0);

    catalog.answer(catalogReply(closedCatalog('ended')));
    await page.reload();
    await expect(page.getByText('La venta en línea está cerrada')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Comprar pases' })).toHaveCount(0);
  });

  test('says an unknown event does not exist', async ({ page }) => {
    await mockPublicCatalog(page, { status: 404, json: { message: 'Event not found' } });
    await page.goto('/e/no-existe');
    await expect(page.getByRole('heading', { name: 'Este evento no existe' })).toBeVisible();
  });

  test('retries after a failure and explains a rate limit', async ({ page }) => {
    const catalog = await mockPublicCatalog(page, { status: 500, json: {} });
    await page.goto(home);
    await expect(page.getByRole('alert')).toContainText('No pudimos completar la solicitud.');
    catalog.answer({ status: 429, json: {} });
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByRole('alert')).toContainText('Hiciste muchos intentos seguidos.');
    catalog.answer(catalogReply());
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByRole('heading', { level: 1, name: eventName })).toBeVisible();
  });

  test('explains that no event is on sale when none is configured', async ({ page }) => {
    // The mocked suite runs without VITE_PUBLIC_EVENT_SLUG; `/e/:slug` covers the configured flow.
    test.skip(!!process.env.VITE_PUBLIC_EVENT_SLUG, 'An event slug is configured');
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'No hay evento a la venta' })).toBeVisible();
  });
});

test.describe('public passes', () => {
  test('applies the pass rules and updates the total', async ({ page }) => {
    await mockPublicCatalog(page, catalogReply());
    await page.goto(home);
    await page.getByRole('link', { name: 'Comprar pases' }).click();
    await expect(page).toHaveURL(passes);
    await expect(page.getByRole('heading', { level: 1, name: 'Elige tus pases' })).toBeVisible();
    await expect(page.getByText('Paso 1 de 4')).toBeVisible();

    const bar = bottomBar(page);
    await expect(bar.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    await expect(bar.getByText('Elige al menos un pase para continuar.')).toBeVisible();
    await expect(pass(page, 'Open Styles')).toBeDisabled();

    await pass(page, 'Entrada general').check();
    await expect(bar.getByText('1 pase')).toBeVisible();
    await expect(bar.getByText('$1,000.00')).toBeVisible();

    await pass(page, 'Pase completo Breaking').check();
    await expect(pass(page, 'Entrada general')).not.toBeChecked();
    await expect(pass(page, 'Entrada general')).toBeDisabled();
    await expect(page.getByText('Ya incluida en tus pases completos')).toBeVisible();
    await pass(page, 'Open Styles').check();
    await expect(bar.getByText('2 pases')).toBeVisible();
    await expect(bar.getByText('$2,800.00')).toBeVisible();

    await pass(page, 'Pase completo Breaking').uncheck();
    await expect(pass(page, 'Open Styles')).not.toBeChecked();
    await expect(pass(page, 'Open Styles')).toBeDisabled();
    await expect(bar.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  });

  test('keeps the chosen passes after a reload', async ({ page }) => {
    await mockPublicCatalog(page, catalogReply());
    await page.goto(passes);
    await pass(page, 'Pase completo Dancehall').check();
    await pass(page, 'Open Styles').check();
    await expect
      .poll(() => page.evaluate((key) => sessionStorage.getItem(key), draftKey))
      .toMatch(/open-styles/);
    await page.reload();
    await expect(pass(page, 'Pase completo Dancehall')).toBeChecked();
    await expect(pass(page, 'Open Styles')).toBeChecked();
    await expect(bottomBar(page).getByText('$2,800.00')).toBeVisible();
  });

  test('continues to competitions only when a chosen pass has some to pick', async ({ page }) => {
    await mockPublicCatalog(page, catalogReply());
    await page.goto(passes);
    await pass(page, 'Entrada general').check();
    await bottomBar(page).getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL(`/e/${slug}/datos`);
    await expect(page.getByText('Paso 3 de 4')).toBeVisible();

    await page.getByRole('link', { name: 'Volver' }).click();
    await expect(page).toHaveURL(passes);
    await pass(page, 'Pase completo Breaking').check();
    await bottomBar(page).getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL(`/e/${slug}/competencias`);
    await expect(page.getByText('Paso 2 de 4')).toBeVisible();
  });

  test('shows the purchase summary beside the passes on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockPublicCatalog(page, catalogReply());
    await page.goto(passes);
    await pass(page, 'Pase completo Breaking').check();
    const summary = page.getByRole('complementary', { name: 'Tu compra' });
    await expect(summary).toBeVisible();
    await expect(summary.getByText('Pase completo Breaking')).toBeVisible();
    await expect(summary.getByText('$2,000.00').last()).toBeVisible();
    await expect(summary.getByRole('button', { name: 'Continuar' })).toBeEnabled();
    await expect(bottomBar(page)).toBeHidden();
    const list = await pass(page, 'Pase completo Breaking').boundingBox();
    const aside = await summary.boundingBox();
    expect(aside!.x).toBeGreaterThan(list!.x + list!.width);
  });
});

for (const theme of themes) {
  test(`home and passes fit 375px with 44px targets in the ${theme} theme`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await useTheme(page, theme);
    await mockPublicCatalog(page, catalogReply());
    await page.goto(home);
    await expect(page.getByRole('heading', { level: 1, name: eventName })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expectFitsAndTargets(page, 375, page.locator('a, button'));

    await page.goto(passes);
    await pass(page, 'Pase completo Breaking').check();
    await expect(page.getByRole('heading', { level: 1, name: 'Elige tus pases' })).toBeVisible();
    await expectFitsAndTargets(page, 375, page.locator('a, button, label:has(input)'));
  });
}
