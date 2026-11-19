import { expect, test, type Page } from '@playwright/test';
import {
  heldPass,
  mockRegistrations,
  registrationId,
  registrationPath,
  registrationSummary,
} from './support/registration-mocks.ts';

// Voiding a pending in-person registration with a reason (#104). Reason rules and failure messages
// are covered by `registration-void-model.test.ts`; this spec checks the rendered flow.
const section = (page: Page) => page.getByRole('region', { name: 'Anular inscripción' });
const openButton = (page: Page) =>
  section(page).getByRole('button', { name: 'Anular inscripción' });
const voidDialog = (page: Page) =>
  page.getByRole('alertdialog', { name: '¿Anular la inscripción de Ana López?' });
const reasonField = (page: Page) => voidDialog(page).getByRole('textbox', { name: 'Motivo' });
const dialogConfirm = (page: Page) =>
  voidDialog(page).getByRole('button', { name: 'Anular inscripción' });

const entitlements = (summary: Parameters<typeof registrationSummary>[1] = {}) => ({
  json: {
    registration: registrationSummary(registrationId, summary),
    passes: [heldPass],
    accessibleActivityIds: [],
  },
});

test('voids a pending in-person registration with the trimmed reason', async ({ page }) => {
  const { voids } = await mockRegistrations(page, {
    entitlements: () => entitlements(),
    void: () => entitlements({ status: 'voided' }),
  });
  await page.goto(registrationPath(registrationId));

  await openButton(page).click();
  await expect(voidDialog(page)).toContainText('Sus pases se conservan como historial.');
  await expect(voidDialog(page)).toContainText(
    'No se puede deshacer, pero puedes registrar a la persona de nuevo.',
  );
  await reasonField(page).fill('  Registro duplicado por error  ');
  await expect(voidDialog(page)).toContainText('Queda en el historial. 28 de 500 caracteres.');
  await dialogConfirm(page).dblclick();

  await expect(page.getByRole('status').filter({ hasText: 'Inscripción anulada' })).toContainText(
    'Se anuló la inscripción. Sus pases quedan como historial',
  );
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page.getByText('Anulada', { exact: true })).toBeVisible();
  await expect(voidDialog(page)).toHaveCount(0);
  await expect(section(page)).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Pago en efectivo' })).toHaveCount(0);
  await expect(page.getByText('Pase completo')).toBeVisible();
  expect(voids).toEqual([
    { registrationId, body: { reason: 'Registro duplicado por error' }, csrf: 'csrf-token' },
  ]);
});

test('blocks a blank reason without calling the API', async ({ page }) => {
  const { voids } = await mockRegistrations(page, { entitlements: () => entitlements() });
  await page.goto(registrationPath(registrationId));

  await openButton(page).click();
  await reasonField(page).fill('   ');
  await dialogConfirm(page).click();

  await expect(reasonField(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(voidDialog(page)).toContainText('Escribe el motivo de la anulación.');
  await expect(reasonField(page)).toBeFocused();
  expect(voids).toHaveLength(0);
});

test('explains a rejected void and locks the action until a reload', async ({ page }) => {
  const { voids } = await mockRegistrations(page, {
    entitlements: () => entitlements(),
    void: () => ({
      status: 409,
      json: { statusCode: 409, message: 'Registration is not pending payment' },
    }),
  });
  await page.goto(registrationPath(registrationId));

  await openButton(page).click();
  await reasonField(page).fill('Registro duplicado');
  await dialogConfirm(page).click();

  await expect(voidDialog(page)).toHaveCount(0);
  const alert = section(page).getByRole('alert');
  await expect(alert).toContainText(
    'Esta inscripción ya no está pendiente de pago: ya se confirmó o se anuló. Recarga para ver su estado.',
  );
  await expect(openButton(page)).toBeDisabled();
  expect(voids).toHaveLength(1);

  await alert.getByRole('button', { name: 'Recargar' }).click();
  await expect(openButton(page)).toBeEnabled();
});

for (const [name, summary] of [
  ['a confirmed registration', { status: 'confirmed', folio: 'LMP-7K3Q' }],
  ['an online pending registration', { channel: 'online' }],
] as const) {
  test(`offers no void for ${name}`, async ({ page }) => {
    await mockRegistrations(page, { entitlements: () => entitlements(summary) });
    await page.goto(registrationPath(registrationId));

    await expect(page.getByText('Pase completo')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Anular inscripción' })).toHaveCount(0);
  });
}
