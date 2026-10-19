import { expect, test, type Page } from '@playwright/test';
import {
  catalogPassType,
  heldPass,
  mockRegistrations,
  registrationId,
  registrationPath,
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
  await expect(
    page.getByRole('heading', { level: 1, name: 'Inscripción de Ana López' }),
  ).toBeVisible();
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
  await expect(confirmDialog(page)).toContainText(
    'Después no podrás quitarlo desde esta pantalla.',
  );
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
