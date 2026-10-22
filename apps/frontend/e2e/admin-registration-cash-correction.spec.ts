import { expect, test, type Page } from '@playwright/test';
import {
  freeHeldPass,
  heldPass,
  mockRegistrations,
  registrationId,
  registrationPath,
  registrationSummary,
} from './support/registration-mocks.ts';

// Correcting the amount or receipt of a confirmed cash payment (#104). Field rules, change
// detection, the pass-total warning copy and failure messages are covered by
// `cash-correction-model.test.ts`; this spec checks the rendered flow.
const section = (page: Page) => page.getByRole('region', { name: 'Pago en efectivo' });
const openButton = (page: Page) =>
  section(page).getByRole('button', { name: 'Corregir pago en efectivo' });
const field = (page: Page, name: string) =>
  section(page).getByRole('textbox', { name, exact: true });
const receiptCheck = (page: Page) =>
  section(page).getByRole('checkbox', { name: 'Revisé el recibo original' });
const reviewButton = (page: Page) =>
  section(page).getByRole('button', { name: 'Revisar corrección' });
const dialog = (page: Page) =>
  page.getByRole('alertdialog', { name: '¿Corregir el pago de Ana López?' });

const cash = { amountCents: 150000, receipt: 'A-17' };

const entitlements = (
  summary: Parameters<typeof registrationSummary>[1] = {},
  passes: unknown[] = [heldPass],
) => ({
  json: {
    registration: registrationSummary(registrationId, {
      status: 'confirmed',
      folio: 'LMP-7K3Q',
      cash,
      ...summary,
    }),
    passes,
    accessibleActivityIds: [],
  },
});

async function fillCorrection(page: Page, amount: string, receipt: string) {
  await openButton(page).click();
  await expect(field(page, 'Monto (MXN)')).toBeFocused();
  await field(page, 'Monto (MXN)').fill(amount);
  await field(page, 'Número de recibo').fill(receipt);
  await field(page, 'Motivo').fill('  Recibo mal capturado  ');
}

test('corrects the receipt of a confirmed cash payment with one POST', async ({ page }) => {
  const { cashCorrections } = await mockRegistrations(page, {
    entitlements: () => entitlements(),
    cashCorrection: () => entitlements({ cash: { amountCents: 150000, receipt: 'A-18' } }),
  });
  await page.goto(registrationPath(registrationId));

  await expect(section(page)).toContainText('$1,500.00');
  await expect(section(page)).toContainText('A-17');
  await fillCorrection(page, '1500', '  A-18 ');
  await receiptCheck(page).check();
  await reviewButton(page).click();
  await expect(dialog(page)).toContainText('Recibo: A-17 → A-18.');
  await dialog(page).getByRole('button', { name: 'Corregir pago' }).dblclick();

  await expect(section(page).getByRole('status')).toHaveText('Se guardó la corrección del pago.');
  await expect(section(page)).toContainText('A-18');
  await expect(openButton(page)).toBeFocused();
  await expect(field(page, 'Motivo')).toHaveCount(0);
  expect(cashCorrections).toEqual([
    {
      registrationId,
      body: {
        amountCents: 150000,
        receipt: 'A-18',
        reason: 'Recibo mal capturado',
        receiptChecked: true,
      },
      csrf: 'csrf-token',
    },
  ]);
});

test('requires the original receipt check without calling the API', async ({ page }) => {
  const { cashCorrections } = await mockRegistrations(page, {
    entitlements: () => entitlements(),
  });
  await page.goto(registrationPath(registrationId));

  await fillCorrection(page, '1500', 'A-18');
  await reviewButton(page).click();

  await expect(receiptCheck(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(section(page)).toContainText(
    'Confirma que revisaste el recibo original antes de corregir.',
  );
  await expect(receiptCheck(page)).toBeFocused();
  await expect(dialog(page)).toHaveCount(0);
  expect(cashCorrections).toHaveLength(0);
});

test('marks a receipt another registration holds', async ({ page }) => {
  const { cashCorrections } = await mockRegistrations(page, {
    entitlements: () => entitlements(),
    cashCorrection: () => ({
      status: 409,
      json: {
        statusCode: 409,
        message: 'Receipt number already used in this event',
        code: 'receipt_taken',
      },
    }),
  });
  await page.goto(registrationPath(registrationId));

  await fillCorrection(page, '1500', 'A-99');
  await receiptCheck(page).check();
  await reviewButton(page).click();
  await dialog(page).getByRole('button', { name: 'Corregir pago' }).click();

  await expect(dialog(page)).toHaveCount(0);
  await expect(field(page, 'Número de recibo')).toHaveAttribute('aria-invalid', 'true');
  await expect(section(page)).toContainText(
    'Ese número de recibo ya está registrado en este evento. Revisa el recibo en papel.',
  );
  await expect(field(page, 'Número de recibo')).toBeFocused();
  expect(cashCorrections).toHaveLength(1);
});

test('warns before confirming an amount that differs from the pass total', async ({ page }) => {
  const { cashCorrections } = await mockRegistrations(page, {
    entitlements: () => entitlements(),
    cashCorrection: () => entitlements({ cash: { amountCents: 120000, receipt: 'A-17' } }),
  });
  await page.goto(registrationPath(registrationId));

  await fillCorrection(page, '1200', 'A-17');
  const warning = 'El monto no coincide con el total de los pases ($1,500.00).';
  await expect(section(page)).toContainText(warning);
  await receiptCheck(page).check();
  await reviewButton(page).click();
  await expect(dialog(page)).toContainText('Monto: $1,500.00 → $1,200.00.');
  await expect(dialog(page)).toContainText(warning);
  await dialog(page).getByRole('button', { name: 'Corregir pago' }).click();

  await expect(section(page)).toContainText('$1,200.00');
  expect(cashCorrections.map(({ body }) => body)).toEqual([
    { amountCents: 120000, receipt: 'A-17', reason: 'Recibo mal capturado', receiptChecked: true },
  ]);
});

test('says when a legacy cash confirmation has no receipt number', async ({ page }) => {
  await mockRegistrations(page, {
    entitlements: () => entitlements({ cash: { amountCents: 150000, receipt: null } }),
  });
  await page.goto(registrationPath(registrationId));

  await expect(section(page)).toContainText('Sin número de recibo');
  await openButton(page).click();
  await expect(field(page, 'Número de recibo')).toHaveValue('');
});

for (const [name, summary, passes] of [
  ['an online confirmed registration', { channel: 'online', cash: null }, [heldPass]],
  ['a complimentary confirmed registration', { cash: null }, [freeHeldPass]],
] as const)
  test(`offers no cash correction on ${name}`, async ({ page }) => {
    await mockRegistrations(page, { entitlements: () => entitlements(summary, [...passes]) });
    await page.goto(registrationPath(registrationId));

    await expect(page.getByRole('region', { name: 'Folio' })).toBeVisible();
    await expect(section(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Corregir pago en efectivo' })).toHaveCount(0);
  });
