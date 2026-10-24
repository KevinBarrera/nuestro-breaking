import { expect, test, type Page } from '@playwright/test';
import {
  cashConfirmed,
  catalogActivity,
  heldPass,
  mockRegistrations,
  registrationId,
  registrationPath,
  registrationSummary,
} from './support/registration-mocks.ts';

// Cash confirmation and the status-driven registration screen (#105). Totals, receipt rules,
// dialog copy and failure messages are covered by `sale-cash-model.test.ts`; this spec checks the
// rendered flow.
const cashSection = (page: Page) => page.getByRole('region', { name: 'Pago en efectivo' });
const receiptField = (page: Page) => page.getByRole('textbox', { name: 'Número de recibo' });
const confirmButton = (page: Page) =>
  cashSection(page).getByRole('button', { name: 'Confirmar pago' });
const confirmDialog = (page: Page) =>
  page.getByRole('alertdialog', { name: '¿Confirmar el pago de $1,700.00?' });
const folio = (page: Page) => page.getByRole('region', { name: 'Resumen' });

const breaking = catalogActivity(
  'a1b2c3d4-1234-4567-89ab-123456789abc',
  'Breaking 1 vs 1',
  '2026-11-14T18:00:00.000Z',
);

const heldBattle = {
  registrationPassId: 'f7b2c3d4-1234-4567-89ab-123456789abc',
  passTypeId: 'f3b2c3d4-1234-4567-89ab-123456789abc',
  name: 'Batalla 1 vs 1',
  passClass: 'add_on',
  priceCents: 20000,
  selections: [breaking.id],
};

const entitlements = (status = 'pending_payment', folioCode: string | null = null) => ({
  json: {
    registration: registrationSummary(registrationId, { status, folio: folioCode }),
    passes: [heldPass, heldBattle],
    accessibleActivityIds: [breaking.id],
  },
});

const receiptTaken = {
  status: 409,
  json: {
    statusCode: 409,
    message: 'Receipt number already used in this event',
    code: 'receipt_taken',
  },
};

test('confirms the cash payment after restating it and shows the folio', async ({ page }) => {
  const { cash } = await mockRegistrations(page, {
    entitlements: () => entitlements(),
    activities: () => ({ json: [breaking] }),
    cash: () => ({ status: 201, json: cashConfirmed(registrationId, 'LMP-7K3Q') }),
  });
  await page.goto(registrationPath(registrationId));
  await expect(cashSection(page)).toContainText('$1,700.00');

  // A missing receipt is caught before the dialog.
  await confirmButton(page).click();
  await expect(cashSection(page)).toContainText('Escribe el número del recibo en papel.');
  await expect(receiptField(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(confirmDialog(page)).toHaveCount(0);

  await receiptField(page).fill('  A-17 ');
  await page.getByRole('textbox', { name: 'Nota (opcional)' }).fill('Billetes de 500');
  await confirmButton(page).click();
  await expect(confirmDialog(page)).toContainText('Recibo A-17 de Ana López.');
  await expect(confirmDialog(page)).toContainText(
    'Para corregir el monto o el recibo después hará falta el recibo original y un motivo.',
  );
  expect(cash).toHaveLength(0);
  await confirmDialog(page).getByRole('button', { name: 'Confirmar pago' }).click();

  await expect(folio(page)).toContainText('LMP-7K3Q');
  await expect(
    page
      .getByRole('main')
      .getByRole('status')
      .filter({ hasText: 'Pago registrado. La inscripción quedó confirmada.' }),
  ).toBeVisible();
  expect(cash).toEqual([
    {
      registrationId,
      body: { amount: 170000, receipt: 'A-17', note: 'Billetes de 500' },
      csrf: 'csrf-token',
    },
  ]);

  // The passes and competitions stay and the sale controls are gone. This pass type is unknown to
  // the catalog, so it has no competitions left to choose and no "Editar competencias" action.
  // The payment just recorded is shown, and only the collapsed cash and name corrections (#104)
  // remain.
  await expect(page.getByRole('main')).toContainText('Confirmada');
  await expect(page.getByRole('region', { name: 'Pases' })).toContainText('Breaking 1 vs 1');
  await expect(cashSection(page)).toContainText('$1,700.00');
  await expect(cashSection(page)).toContainText('A-17');
  await expect(page.getByRole('main').getByRole('button')).toHaveText([
    'Corregir pago',
    'Corregir nombre o AKA',
  ]);
  await expect(page.getByRole('main').getByRole('textbox')).toHaveCount(0);
});

test('shows a taken receipt number on the receipt field', async ({ page }) => {
  const { cash } = await mockRegistrations(page, {
    entitlements: () => entitlements(),
    cash: (attempt) =>
      attempt === 1
        ? receiptTaken
        : { status: 201, json: cashConfirmed(registrationId, 'LMP-7K3Q') },
  });
  await page.goto(registrationPath(registrationId));
  await receiptField(page).fill('A-17');
  await confirmButton(page).click();
  await confirmDialog(page).getByRole('button', { name: 'Confirmar pago' }).click();

  await expect(receiptField(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(cashSection(page)).toContainText(
    'Ese número de recibo ya está registrado en este evento. Revisa el recibo en papel.',
  );
  await expect(cashSection(page).getByRole('button', { name: 'Recargar' })).toHaveCount(0);

  // Another receipt number goes through.
  await receiptField(page).fill('A-18');
  await expect(receiptField(page)).not.toHaveAttribute('aria-invalid');
  await confirmButton(page).click();
  await confirmDialog(page).getByRole('button', { name: 'Confirmar pago' }).click();
  await expect(folio(page)).toContainText('LMP-7K3Q');
  expect(cash.map((sent) => sent.body)).toEqual([
    { amount: 170000, receipt: 'A-17' },
    { amount: 170000, receipt: 'A-18' },
  ]);
});

test('never resends a payment whose answer was lost and offers a reload', async ({ page }) => {
  // The lost POST did confirm the registration: only a fresh read shows it.
  let confirmed = false;
  const { cash } = await mockRegistrations(page, {
    entitlements: () => (confirmed ? entitlements('confirmed', 'LMP-7K3Q') : entitlements()),
    cash: () => {
      confirmed = true;
      return { abort: true };
    },
  });
  await page.goto(registrationPath(registrationId));
  await receiptField(page).fill('A-17');
  await confirmButton(page).click();
  await confirmDialog(page).getByRole('button', { name: 'Confirmar pago' }).click();

  const alert = cashSection(page).getByRole('alert');
  await expect(alert).toContainText(
    'No pudimos confirmar si el pago se registró. Recarga la inscripción antes de intentarlo de nuevo.',
  );
  await expect(confirmButton(page)).toBeDisabled();
  expect(cash).toHaveLength(1);

  await alert.getByRole('button', { name: 'Recargar' }).click();
  await expect(folio(page)).toContainText('LMP-7K3Q');
  await expect(cashSection(page)).toHaveCount(0);
  expect(cash).toHaveLength(1);
});

test('sends one payment when the confirm button is clicked twice at once', async ({ page }) => {
  const { cash } = await mockRegistrations(page, {
    entitlements: () => entitlements(),
    cash: () => ({ status: 201, json: cashConfirmed(registrationId, 'LMP-7K3Q') }),
  });
  await page.goto(registrationPath(registrationId));
  await receiptField(page).fill('A-17');
  await confirmButton(page).click();

  // Two clicks in one task land before React re-renders the disabled button.
  await confirmDialog(page)
    .getByRole('button', { name: 'Confirmar pago' })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });

  await expect(folio(page)).toContainText('LMP-7K3Q');
  await page.waitForLoadState('networkidle');
  expect(cash).toHaveLength(1);
});

test('shows a voided registration as read-only', async ({ page }) => {
  const { cash } = await mockRegistrations(page, {
    entitlements: () => entitlements('voided'),
  });
  await page.goto(registrationPath(registrationId));
  await expect(page.getByRole('main')).toContainText('Inscripción anulada');
  await expect(page.getByRole('main')).toContainText(
    'Esta inscripción está anulada: no admite pases, competencias ni pagos.',
  );
  await expect(page.getByRole('region', { name: 'Pases' })).toContainText('Pase completo');
  await expect(page.getByRole('region', { name: 'Agregar pase' })).toHaveCount(0);
  await expect(cashSection(page)).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('textbox')).toHaveCount(0);
  expect(cash).toHaveLength(0);
});
