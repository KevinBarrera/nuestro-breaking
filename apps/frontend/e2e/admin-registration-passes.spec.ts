import { expect, test, type Page } from '@playwright/test';
import {
  catalogPassType,
  heldPass,
  mockRegistrations,
  registrationId,
  registrationPath,
  registrationSummary,
} from './support/registration-mocks.ts';

// Pass picker of the in-person sale (#105). Disabled reasons, dialog copy and failure messages
// are covered by `sale-pass-model.test.ts`; this spec checks the rendered flow.
const picker = (page: Page) => page.getByRole('region', { name: 'Agregar pase' });
const held = (page: Page) => page.getByRole('region', { name: 'Pases' });
const confirmDialog = (page: Page) =>
  page.getByRole('alertdialog', { name: '¿Agregar «Entrada general» por $300.00?' });

const general = catalogPassType(
  'f2b2c3d4-1234-4567-89ab-123456789abc',
  'Entrada general',
  'general',
  30000,
);
const battle = catalogPassType(
  'f3b2c3d4-1234-4567-89ab-123456789abc',
  'Batalla 1 vs 1',
  'add_on',
  20000,
  { requiresPassClass: 'general' },
);
const full = catalogPassType(heldPass.passTypeId, 'Pase completo', 'full', 150000);

const heldGeneral = {
  registrationPassId: 'f8b2c3d4-1234-4567-89ab-123456789abc',
  passTypeId: general.id,
  name: 'Entrada general',
  passClass: 'general',
  priceCents: 30000,
  selections: [],
};

test('adds a pass only after confirming it, and explains the passes it cannot get', async ({
  page,
}) => {
  const { addedPasses } = await mockRegistrations(page, {
    passTypes: () => ({ json: [full, general, battle] }),
    addPass: () => ({
      status: 201,
      json: { passes: [heldGeneral], accessibleActivityIds: [] },
    }),
  });
  // Opened directly, as after a reload: the name and status come from the entitlements read.
  await page.goto(registrationPath(registrationId));
  await expect(page.getByRole('heading', { level: 1, name: 'Ana López' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Pendiente de pago');
  await expect(held(page)).toContainText('Aún no tiene pases.');

  const options = picker(page).getByRole('listitem');
  await expect(options).toHaveCount(3);
  await expect(options.nth(0)).toContainText('Pase completo');
  await expect(options.nth(0)).toContainText('$1,500.00');
  await expect(options.nth(2)).toContainText('Primero agrega una entrada general.');
  await expect(picker(page).getByRole('button', { name: 'Agregar Batalla 1 vs 1' })).toHaveCount(0);

  // Cancelling sends nothing.
  await picker(page).getByRole('button', { name: 'Agregar Entrada general' }).click();
  await expect(confirmDialog(page)).toContainText('Hasta entonces puedes quitarlo.');
  await confirmDialog(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirmDialog(page)).toHaveCount(0);
  expect(addedPasses).toHaveLength(0);

  await picker(page).getByRole('button', { name: 'Agregar Entrada general' }).click();
  await confirmDialog(page).getByRole('button', { name: 'Agregar pase' }).click();
  await expect(confirmDialog(page)).toHaveCount(0);
  await expect(picker(page).getByRole('status')).toHaveText('Se agregó «Entrada general».');
  expect(addedPasses).toEqual([
    { registrationId, body: { passTypeId: general.id }, csrf: 'csrf-token' },
  ]);

  // The screen follows the returned entitlements: the pass is held, the rules move on.
  await expect(held(page)).toContainText('Entrada general');
  await expect(held(page)).toContainText('$300.00');
  await expect(options.nth(0)).toContainText(
    'Ya tiene entrada general y el pase completo la incluye.',
  );
  await expect(options.nth(1)).toContainText('Ya tiene este pase.');
  await expect(picker(page).getByRole('button', { name: 'Agregar Batalla 1 vs 1' })).toBeEnabled();
});

test('does not retry a pass whose answer was lost and offers a reload', async ({ page }) => {
  // The lost POST did add the pass: only a fresh read shows it.
  let added = false;
  const { addedPasses } = await mockRegistrations(page, {
    passTypes: () => ({ json: [general] }),
    entitlements: () => ({
      json: { passes: added ? [heldGeneral] : [], accessibleActivityIds: [] },
    }),
    addPass: () => {
      added = true;
      return { abort: true };
    },
  });
  await page.goto(registrationPath(registrationId));
  await picker(page).getByRole('button', { name: 'Agregar Entrada general' }).click();
  await confirmDialog(page).getByRole('button', { name: 'Agregar pase' }).click();

  const alert = picker(page).getByRole('alert');
  await expect(alert).toContainText(
    'No pudimos confirmar si el pase se agregó. Recarga la inscripción antes de intentarlo de nuevo.',
  );
  expect(addedPasses).toHaveLength(1);

  await alert.getByRole('button', { name: 'Recargar' }).click();
  await expect(held(page)).toContainText('Entrada general');
  await expect(picker(page).getByRole('listitem')).toContainText('Ya tiene este pase.');
  expect(addedPasses).toHaveLength(1);
});

test('offers a reload when the pass types cannot be read, keeping the screen meanwhile', async ({
  page,
}) => {
  let reloaded = false;
  await mockRegistrations(page, {
    entitlements: () => ({ json: { passes: [heldPass], accessibleActivityIds: [] } }),
    passTypes: () => (reloaded ? { json: [full, general] } : { status: 500, json: {} }),
  });
  // Holds the reload's entitlements read, so the screen can be checked while it waits.
  let releaseReload = () => {};
  const reloadAnswered = new Promise<void>((resolve) => (releaseReload = resolve));
  await page.route(/\/registrations\/[^/]+\/entitlements$/, async (route) => {
    if (reloaded) await reloadAnswered;
    await route.fallback();
  });
  await page.goto(registrationPath(registrationId));
  const notice = picker(page).getByText('No pudimos cargar los pases del evento.');
  await expect(notice).toBeVisible();

  reloaded = true;
  await picker(page).getByRole('button', { name: 'Recargar' }).click();
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('status').filter({ hasText: 'Actualizando…' })).toBeVisible();
  await expect(held(page)).toContainText('Pase completo');

  releaseReload();
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByText('Actualizando…')).toHaveCount(0);
  await expect(notice).toHaveCount(0);
  await expect(picker(page).getByRole('listitem')).toHaveCount(2);
});

// Removing a held pass (#282). Blockers, dialog copy and failure messages are covered by
// `sale-pass-removal-model.test.ts`.
const workshop = catalogPassType(
  'f4b2c3d4-1234-4567-89ab-123456789abc',
  'Taller de footwork',
  'add_on',
  20000,
);
const openStyles = catalogPassType(
  'f5b2c3d4-1234-4567-89ab-123456789abc',
  'Open Styles',
  'add_on',
  25000,
  { requiresPassClass: 'full' },
);
const heldAddOn = (passType: ReturnType<typeof catalogPassType>, registrationPassId: string) => ({
  registrationPassId,
  passTypeId: passType.id,
  name: passType.name,
  passClass: 'add_on',
  priceCents: passType.priceCents,
  selections: [],
});
const heldWorkshop = heldAddOn(workshop, 'f6b2c3d4-1234-4567-89ab-123456789abc');
const heldOpenStyles = heldAddOn(openStyles, 'f7b2c3d4-1234-4567-89ab-123456789abc');
const removeDialog = (page: Page, name: string) =>
  page.getByRole('alertdialog', { name: `¿Quitar «${name}»?` });
const cashTotal = (page: Page) =>
  page.getByRole('region', { name: 'Pago en efectivo' }).getByRole('definition');

test('removes a held pass only after confirming it, and the total follows', async ({ page }) => {
  const { removedPasses } = await mockRegistrations(page, {
    passTypes: () => ({ json: [full, workshop] }),
    entitlements: () => ({ json: { passes: [heldPass, heldWorkshop], accessibleActivityIds: [] } }),
    removePass: () => ({ json: { passes: [heldPass], accessibleActivityIds: [] } }),
  });
  await page.goto(registrationPath(registrationId));
  await expect(cashTotal(page)).toHaveText('$1,700.00');

  await held(page).getByRole('button', { name: 'Quitar «Taller de footwork»' }).click();
  const dialog = removeDialog(page, 'Taller de footwork');
  await expect(dialog).toContainText('Se descuentan $200.00 del total.');
  await dialog.getByRole('button', { name: 'Quitar pase' }).click();
  await expect(dialog).toHaveCount(0);

  await expect(held(page).getByRole('status')).toHaveText('Se quitó «Taller de footwork».');
  expect(removedPasses).toEqual([
    {
      registrationId,
      registrationPassId: heldWorkshop.registrationPassId,
      csrf: 'csrf-token',
    },
  ]);
  await expect(held(page).getByRole('listitem')).toHaveCount(1);
  await expect(held(page).getByRole('listitem')).toContainText('Pase completo');
  await expect(cashTotal(page)).toHaveText('$1,500.00');
});

test('keeps a full pass while an add-on that requires it is held', async ({ page }) => {
  const { removedPasses } = await mockRegistrations(page, {
    passTypes: () => ({ json: [full, openStyles] }),
    entitlements: () => ({
      json: { passes: [heldPass, heldOpenStyles], accessibleActivityIds: [] },
    }),
  });
  await page.goto(registrationPath(registrationId));
  const removeFull = held(page).getByRole('button', { name: 'Quitar «Pase completo»' });
  await expect(removeFull).toBeDisabled();
  await expect(removeFull).toHaveAccessibleDescription(
    'Quita primero «Open Styles», que requiere este pase.',
  );
  await expect(held(page).getByRole('button', { name: 'Quitar «Open Styles»' })).toBeEnabled();
  expect(removedPasses).toHaveLength(0);
});

test('shows a rejected removal and sends nothing more', async ({ page }) => {
  const { removedPasses } = await mockRegistrations(page, {
    passTypes: () => ({ json: [full] }),
    entitlements: () => ({ json: { passes: [heldPass], accessibleActivityIds: [] } }),
    removePass: () => ({
      status: 409,
      json: { statusCode: 409, message: 'Online registrations cannot lose a pass' },
    }),
  });
  await page.goto(registrationPath(registrationId));
  await held(page).getByRole('button', { name: 'Quitar «Pase completo»' }).click();
  await removeDialog(page, 'Pase completo').getByRole('button', { name: 'Quitar pase' }).click();

  const alert = held(page).getByRole('alert');
  await expect(alert).toContainText(
    'Esta inscripción se hizo en línea: sus pases no se pueden quitar.',
  );
  await expect(alert.getByRole('button', { name: 'Recargar' })).toBeVisible();
  await expect(held(page)).toContainText('Pase completo');
  expect(removedPasses).toHaveLength(1);
});

test('offers no removal once the registration is confirmed', async ({ page }) => {
  await mockRegistrations(page, {
    passTypes: () => ({ json: [full] }),
    entitlements: (id) => ({
      json: {
        registration: registrationSummary(id, { status: 'confirmed', folio: 'LMP-7K3Q' }),
        passes: [heldPass],
        accessibleActivityIds: [],
      },
    }),
  });
  await page.goto(registrationPath(registrationId));
  await expect(held(page)).toContainText('Pase completo');
  await expect(page.getByRole('button', { name: /^Quitar/ })).toHaveCount(0);
});
