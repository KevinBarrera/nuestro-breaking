import { expect, test, type Page } from '@playwright/test';
import {
  freeHeldPass,
  heldPass,
  mockRegistrations,
  registrationId,
  registrationPath,
  registrationSummary,
} from './support/registration-mocks.ts';

// Correcting the amount or receipt of a confirmed cash payment (#104) in the two-step modal (#345).
// Field rules, change detection, the pass-total hint copy, the review rows and failure messages are
// covered by `cash-correction-model.test.ts`; this spec checks the rendered flow.
const section = (page: Page) => page.getByRole('region', { name: 'Pago en efectivo' });
const openButton = (page: Page) => section(page).getByRole('button', { name: 'Corregir pago' });
const dialog = (page: Page) => page.getByRole('dialog');
const field = (page: Page, name: string) =>
  dialog(page).getByRole('textbox', { name, exact: true });
const receiptCheck = (page: Page) =>
  dialog(page).getByRole('checkbox', { name: 'Revisé el recibo en papel' });
const reviewButton = (page: Page) => dialog(page).getByRole('button', { name: 'Revisar cambios' });
const confirmButton = (page: Page) => dialog(page).getByRole('button', { name: 'Corregir pago' });
const changes = (page: Page) => dialog(page).getByRole('table', { name: 'Cambios' });

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
  await expect(dialog(page)).toContainText('Paso 1 de 2 · Cambios');
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
  await expect(dialog(page)).toContainText('Paso 2 de 2 · Revisión');
  await expect(changes(page).getByRole('row')).toHaveText([
    'DatoAntesDespués',
    'Número de reciboA-17A-18',
  ]);
  await expect(dialog(page)).toContainText('Recibo mal capturado');
  expect(cashCorrections).toHaveLength(0);
  await confirmButton(page).dblclick();

  await expect(dialog(page)).toHaveCount(0);
  await expect(section(page).getByRole('status')).toHaveText(
    'Se corrigió el pago en efectivo. El pago original queda en el historial.',
  );
  await expect(section(page)).toContainText('A-18');
  await expect(openButton(page)).toBeFocused();
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

test('requires the receipt check and a change without calling the API', async ({ page }) => {
  const { cashCorrections } = await mockRegistrations(page, {
    entitlements: () => entitlements(),
  });
  await page.goto(registrationPath(registrationId));

  await fillCorrection(page, '1500', 'A-18');
  await reviewButton(page).click();
  await expect(receiptCheck(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog(page)).toContainText('Confirma que revisaste el recibo antes de corregir.');
  await expect(receiptCheck(page)).toBeFocused();
  await expect(dialog(page)).toContainText('Paso 1 de 2 · Cambios');

  // Back to the saved values: nothing to save.
  await field(page, 'Número de recibo').fill('A-17');
  await receiptCheck(page).check();
  await reviewButton(page).click();
  await expect(dialog(page)).toContainText('No hay cambios que guardar. Modifica algo o cancela.');

  // A blank reason is required.
  await field(page, 'Número de recibo').fill('A-18');
  await field(page, 'Motivo').fill('  ');
  await reviewButton(page).click();
  await expect(dialog(page)).toContainText('Escribe el motivo. Queda en el historial.');
  await dialog(page).getByRole('button', { name: 'Cancelar' }).click();
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
  await confirmButton(page).click();

  // Back on the form with the field marked.
  await expect(dialog(page)).toContainText('Paso 1 de 2 · Cambios');
  await expect(field(page, 'Número de recibo')).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog(page)).toContainText(
    'Ese número de recibo ya está registrado en este evento. Revisa el recibo en papel.',
  );
  await expect(field(page, 'Número de recibo')).toBeFocused();
  expect(cashCorrections).toHaveLength(1);
});

test('explains an amount that differs from the pass total and saves it', async ({ page }) => {
  const { cashCorrections } = await mockRegistrations(page, {
    entitlements: () => entitlements(),
    cashCorrection: () => entitlements({ cash: { amountCents: 120000, receipt: 'A-17' } }),
  });
  await page.goto(registrationPath(registrationId));

  await fillCorrection(page, '1200', 'A-17');
  await expect(dialog(page)).toContainText(
    'No coincide con el total de los pases ($1,500.00). Puedes guardarlo si así dice el recibo.',
  );
  await receiptCheck(page).check();
  await reviewButton(page).click();
  await expect(changes(page).getByRole('row')).toHaveText([
    'DatoAntesDespués',
    'Monto$1,500.00$1,200.00',
  ]);
  await confirmButton(page).click();

  await expect(section(page)).toContainText('$1,200.00');
  await expect(section(page)).toContainText(
    'Faltan $300.00 para cubrir el total de los pases ($1,500.00). Si fue un error de captura, corrige el pago.',
  );
  await expect(page.getByRole('region', { name: 'Resumen' })).toContainText('Faltan $300.00');
  expect(cashCorrections.map(({ body }) => body)).toEqual([
    { amountCents: 120000, receipt: 'A-17', reason: 'Recibo mal capturado', receiptChecked: true },
  ]);
});

test('offers only a reload when the answer was lost', async ({ page }) => {
  let reads = 0;
  const { cashCorrections } = await mockRegistrations(page, {
    entitlements: () => {
      reads += 1;
      return entitlements();
    },
    cashCorrection: () => ({ abort: true }),
  });
  await page.goto(registrationPath(registrationId));

  await fillCorrection(page, '1500', 'A-18');
  await receiptCheck(page).check();
  await reviewButton(page).click();
  await confirmButton(page).click();
  await expect(dialog(page).getByRole('alert')).toContainText(
    'Recarga la inscripción antes de intentarlo de nuevo.',
  );
  await expect(confirmButton(page)).toBeDisabled();
  const before = reads;
  await dialog(page).getByRole('button', { name: 'Recargar' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect.poll(() => reads).toBeGreaterThan(before);
  expect(cashCorrections).toHaveLength(1);
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

    await expect(page.getByRole('region', { name: 'Resumen' })).toContainText(
      'Sin cobro en efectivo',
    );
    await expect(section(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Corregir pago' })).toHaveCount(0);
  });
