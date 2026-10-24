import { expect, test, type Page } from '@playwright/test';
import {
  catalogActivity,
  catalogPassType,
  cashConfirmed,
  freeHeldPass,
  heldPass,
  mockRegistrations,
  registrationId,
  registrationPath,
  registrationSummary,
} from './support/registration-mocks.ts';

// Confirmation without payment of a $0 registration (#263). Reason rules, dialog copy and failure
// messages are covered by `sale-complimentary-model.test.ts`; this spec checks the rendered flow.
const section = (page: Page) => page.getByRole('region', { name: 'Confirmación sin cobro' });
const reasonField = (page: Page) => page.getByRole('textbox', { name: 'Motivo' });
const confirmButton = (page: Page) =>
  section(page).getByRole('button', { name: 'Confirmar sin cobro' });
const confirmDialog = (page: Page) =>
  page.getByRole('alertdialog', { name: '¿Confirmar sin cobro la inscripción de Ana López?' });
const dialogConfirm = (page: Page) =>
  confirmDialog(page).getByRole('button', { name: 'Confirmar sin cobro' });
const folio = (page: Page) => page.getByRole('region', { name: 'Resumen' });

const entitlements = (passes = [freeHeldPass]) => ({
  json: {
    registration: registrationSummary(registrationId),
    passes,
    accessibleActivityIds: [],
  },
});

const confirmed = () => ({ status: 201, json: cashConfirmed(registrationId, 'LMP-G0LD') });

test('confirms a $0 registration without payment and shows the folio', async ({ page }) => {
  const { complimentary, cash } = await mockRegistrations(page, {
    entitlements: () => entitlements(),
    complimentary: confirmed,
  });
  await page.goto(registrationPath(registrationId));
  await expect(page.getByRole('region', { name: 'Pago en efectivo' })).toHaveCount(0);

  await reasonField(page).fill('  Golden ticket, ganador de la batalla ');
  await expect(section(page)).toContainText('36 de 500 caracteres.');
  await confirmButton(page).click();
  await expect(confirmDialog(page)).toContainText(
    'Motivo: Golden ticket, ganador de la batalla. La inscripción quedará confirmada sin pago, con su folio, y se enviará el correo de confirmación.',
  );
  expect(complimentary).toHaveLength(0);
  await dialogConfirm(page).click();

  await expect(folio(page)).toContainText('LMP-G0LD');
  await expect(
    page
      .getByRole('main')
      .getByRole('status')
      .filter({ hasText: 'La inscripción quedó confirmada sin cobro.' }),
  ).toBeVisible();
  expect(complimentary).toEqual([
    {
      registrationId,
      body: { reason: 'Golden ticket, ganador de la batalla' },
      csrf: 'csrf-token',
    },
  ]);
  expect(cash).toHaveLength(0);
  await expect(section(page)).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('textbox')).toHaveCount(0);
});

test('blocks an empty reason before the dialog', async ({ page }) => {
  const { complimentary } = await mockRegistrations(page, {
    entitlements: () => entitlements(),
    complimentary: confirmed,
  });
  await page.goto(registrationPath(registrationId));
  await reasonField(page).fill('   ');
  await confirmButton(page).click();

  await expect(section(page)).toContainText('Escribe el motivo de la confirmación sin cobro.');
  await expect(reasonField(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(confirmDialog(page)).toHaveCount(0);
  expect(complimentary).toHaveLength(0);
});

test('waits for unsaved competition checks before confirming', async ({ page }) => {
  const breaking = catalogActivity(
    'b1b2c3d4-1234-4567-89ab-123456789abc',
    'Breaking 1 vs 1',
    '2026-11-14T16:00:00Z',
  );
  const golden = catalogPassType(freeHeldPass.passTypeId, 'Golden ticket', 'full', 0, {
    activities: [{ activityId: breaking.id, access: 'selectable' }],
  });
  const { complimentary } = await mockRegistrations(page, {
    entitlements: () => entitlements(),
    passTypes: () => ({ json: [golden] }),
    activities: () => ({ json: [breaking] }),
    complimentary: confirmed,
  });
  await page.goto(registrationPath(registrationId));
  await reasonField(page).fill('Golden ticket');
  await page.getByRole('group', { name: 'Golden ticket' }).getByText('Breaking 1 vs 1').click();

  await expect(confirmButton(page)).toBeDisabled();
  await expect(confirmButton(page)).toHaveAccessibleDescription(
    'Guarda o descarta los cambios de competencias de «Golden ticket» antes de confirmar.',
  );
  expect(complimentary).toHaveLength(0);
});

test('sends one confirmation when the confirm button is clicked twice at once', async ({
  page,
}) => {
  const { complimentary } = await mockRegistrations(page, {
    entitlements: () => entitlements(),
    complimentary: confirmed,
  });
  await page.goto(registrationPath(registrationId));
  await reasonField(page).fill('Invitado del jurado');
  await confirmButton(page).click();

  // Two clicks in one task land before React re-renders the disabled button.
  await dialogConfirm(page).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });

  await expect(folio(page)).toContainText('LMP-G0LD');
  await page.waitForLoadState('networkidle');
  expect(complimentary).toHaveLength(1);
});

test('offers a reload when the total is no longer zero and never resends', async ({ page }) => {
  // A priced pass was added elsewhere: only a fresh read shows it.
  let priced = false;
  const { complimentary } = await mockRegistrations(page, {
    entitlements: () => (priced ? entitlements([freeHeldPass, heldPass]) : entitlements()),
    complimentary: () => {
      priced = true;
      return {
        status: 409,
        json: {
          statusCode: 409,
          message: 'Registration passes do not total zero',
          code: 'not_zero_total',
        },
      };
    },
  });
  await page.goto(registrationPath(registrationId));
  await reasonField(page).fill('Golden ticket');
  await confirmButton(page).click();
  await dialogConfirm(page).click();

  const alert = section(page).getByRole('alert');
  await expect(alert).toContainText(
    'Esta inscripción ya tiene un monto a cobrar. Recarga para registrar el pago en efectivo.',
  );
  await expect(confirmButton(page)).toBeDisabled();
  expect(complimentary).toHaveLength(1);

  await alert.getByRole('button', { name: 'Recargar' }).click();
  await expect(page.getByRole('region', { name: 'Pago en efectivo' })).toContainText('$1,500.00');
  await expect(section(page)).toHaveCount(0);
  expect(complimentary).toHaveLength(1);
});
