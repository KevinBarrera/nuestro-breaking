import { expect, test, type Locator, type Page } from '@playwright/test';
import { themes, useTheme } from './support/admin-mocks.ts';
import { catalogReply, draftKey, mockPublicCatalog, slug } from './support/public-mocks.ts';

// Phone first, like the home and passes spec.
test.use({ viewport: { width: 390, height: 844 } });

const step = (name: 'pases' | 'competencias' | 'datos' | 'revisar') => `/e/${slug}/${name}`;

// Starts a purchase on the passes screen with the given passes chosen.
async function choosePasses(page: Page, names: string[]) {
  await mockPublicCatalog(page, catalogReply());
  await page.goto(step('pases'));
  for (const name of names) await page.getByRole('checkbox', { name: new RegExp(name) }).check();
  await page
    .getByRole('region', { name: 'Resumen de tu compra' })
    .getByRole('button', { name: 'Continuar' })
    .click();
}

const field = (page: Page, label: string | RegExp) => page.getByLabel(label);

async function fillRequired(page: Page) {
  await field(page, 'Nombre(s)').fill('Ana');
  await field(page, 'Primer apellido').fill('López');
  await field(page, 'Correo electrónico').fill('ana@ejemplo.com');
  await field(page, 'Teléfono celular').fill('33 1234 5678');
}

async function expectFitsAndTargets(page: Page, width: number, targets: Locator) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
  for (const target of await targets.all()) {
    if (!(await target.isVisible())) continue;
    const box = await target.boundingBox();
    const name = (await target.getAttribute('id')) ?? (await target.textContent()) ?? '';
    expect(box!.height, name).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width, name).toBeLessThanOrEqual(width);
  }
}

test.describe('public competitions', () => {
  test('toggles competitions per pass and shows included ones', async ({ page }) => {
    await choosePasses(page, ['Pase completo Breaking', 'Open Styles']);
    await expect(page).toHaveURL(step('competencias'));
    await expect(page.getByText('Paso 2 de 4')).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Elige tus competencias' }),
    ).toBeVisible();
    await expect(page.getByText(/^Es opcional\./)).toBeVisible();

    const breaking = page.getByRole('group', { name: 'Pase completo Breaking' });
    const bgirl = breaking.getByRole('button', { name: 'Breaking Bgirl' });
    await expect(bgirl).toHaveAttribute('aria-pressed', 'false');
    await bgirl.click();
    await expect(bgirl).toHaveAttribute('aria-pressed', 'true');
    await breaking.getByRole('button', { name: 'Breaking 3v3' }).click();
    await bgirl.click();
    await expect(bgirl).toHaveAttribute('aria-pressed', 'false');

    const openStyles = page.getByRole('region', { name: 'Open Styles' });
    await expect(openStyles.getByText('Open Styles 1vs1')).toBeVisible();
    await expect(openStyles.getByText('Incluida', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Atrás' }).click();
    await expect(page).toHaveURL(step('pases'));
    await page.goBack();
    await expect(page.getByRole('button', { name: 'Breaking 3v3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL(step('datos'));
    await expect(page.getByRole('heading', { level: 1, name: 'Tus datos' })).toBeVisible();
  });

  test('skips competitions when the chosen passes have none to pick', async ({ page }) => {
    await choosePasses(page, ['Entrada general']);
    await expect(page).toHaveURL(step('datos'));
    await page.goto(step('competencias'));
    await expect(page).toHaveURL(step('datos'));
    await page.getByRole('link', { name: 'Atrás' }).click();
    await expect(page).toHaveURL(step('pases'));
  });

  test('sends the steps back to pases when no pass is chosen', async ({ page }) => {
    await mockPublicCatalog(page, catalogReply());
    for (const name of ['competencias', 'datos', 'revisar'] as const) {
      await page.goto(step(name));
      await expect(page).toHaveURL(step('pases'));
      await expect(page.getByRole('heading', { level: 1, name: 'Elige tus pases' })).toBeVisible();
    }
  });
});

test.describe('public buyer data', () => {
  test('shows inline errors with a summary and focuses the first invalid field', async ({
    page,
  }) => {
    await choosePasses(page, ['Entrada general']);
    await expect(page.getByText('Paso 3 de 4')).toBeVisible();
    await expect(
      page.getByText('Los datos de la persona que va a asistir y competir.'),
    ).toBeVisible();
    await expect(field(page, 'Correo electrónico')).toHaveAttribute('type', 'email');
    await expect(field(page, 'Teléfono celular')).toHaveAttribute('inputmode', 'tel');
    await expect(page.getByText('+52', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Revisar compra' }).click();
    const summary = page.getByRole('alert');
    await expect(summary).toContainText('Revisa estos datos');
    await expect(summary).toContainText('Correo electrónico');
    await expect(field(page, 'Nombre(s)')).toBeFocused();
    await expect(field(page, 'Nombre(s)')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Escribe tu nombre.', { exact: true })).toBeVisible();
    await expect(page.getByText('Escribe tu teléfono celular.', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(step('datos'));

    await field(page, 'Nombre(s)').fill('Ana');
    await field(page, 'Primer apellido').fill('López');
    await field(page, 'Correo electrónico').fill('ana@ejemplo');
    await field(page, 'Teléfono celular').fill('331234');
    await page.getByRole('button', { name: 'Revisar compra' }).click();
    await expect(field(page, 'Correo electrónico')).toBeFocused();
    await expect(
      page.getByText('Escribe un correo válido, por ejemplo nombre@correo.com.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Escribe los 10 dígitos de tu celular.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Escribe tu nombre.', { exact: true })).toHaveCount(0);
  });

  test('opens the optional details when an error is inside them', async ({ page }) => {
    await choosePasses(page, ['Entrada general']);
    await fillRequired(page);
    const details = page.locator('details');
    await expect(details).not.toHaveAttribute('open');
    await page.getByText('Más datos (opcional): ciudad, Instagram, nivel').click();
    await field(page, /^Instagram/).fill('ana dance');
    await page.getByText('Más datos (opcional): ciudad, Instagram, nivel').click();
    await expect(details).not.toHaveAttribute('open');

    await page.getByRole('button', { name: 'Revisar compra' }).click();
    await expect(details).toHaveAttribute('open');
    await expect(field(page, /^Instagram/)).toBeFocused();
    await expect(page.getByText('Escribe tu usuario sin espacios.', { exact: true })).toBeVisible();
  });

  test('moves to review with valid data and keeps the draft after a reload', async ({ page }) => {
    await choosePasses(page, ['Pase completo Breaking']);
    await page.getByRole('button', { name: 'Breaking Bboy' }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await fillRequired(page);
    await field(page, 'Segundo').fill('Ruiz');
    await page.getByText('Más datos (opcional): ciudad, Instagram, nivel').click();
    await field(page, /^Ciudad/).fill('Guadalajara');
    await field(page, /^Fecha de nacimiento/).fill('2001-04-09');
    await expect
      .poll(() => page.evaluate((key) => sessionStorage.getItem(key), draftKey))
      .toMatch(/Guadalajara/);

    await page.reload();
    await expect(field(page, 'Nombre(s)')).toHaveValue('Ana');
    await expect(field(page, 'Segundo')).toHaveValue('Ruiz');
    await expect(field(page, 'Teléfono celular')).toHaveValue('33 1234 5678');
    await page.getByRole('link', { name: 'Atrás' }).click();
    await expect(page).toHaveURL(step('competencias'));
    await expect(page.getByRole('button', { name: 'Breaking Bboy' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Continuar' }).click();

    await page.getByRole('button', { name: 'Revisar compra' }).click();
    await expect(page).toHaveURL(step('revisar'));
    await expect(page.getByText('Paso 4 de 4')).toBeVisible();
  });
});

for (const theme of themes) {
  test(`competitions and buyer data fit 375px with 44px targets in the ${theme} theme`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await useTheme(page, theme);
    await choosePasses(page, ['Pase completo Breaking', 'Open Styles']);
    await page.getByRole('button', { name: 'Breaking Bgirl' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expectFitsAndTargets(page, 375, page.locator('a, button'));

    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: 'Revisar compra' }).click();
    await page.getByText('Más datos (opcional): ciudad, Instagram, nivel').click();
    await expectFitsAndTargets(page, 375, page.locator('a, button, summary, input'));
  });
}

test('offers a reload when a lazy area fails to load', async ({ page }) => {
  // An old tab after a deploy asks for a chunk that no longer exists.
  await page.route(/admin-session-boundary/, (route) => route.abort());
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'No pudimos cargar esta página' })).toBeVisible();
  await page.unroute(/admin-session-boundary/);
  await page.getByRole('button', { name: 'Recargar' }).click();
  await expect(page.getByRole('heading', { name: 'No pudimos cargar esta página' })).toBeHidden();
});
