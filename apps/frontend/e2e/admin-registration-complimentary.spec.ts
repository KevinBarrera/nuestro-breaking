import { expect, test, type Page } from '@playwright/test';
import {
  cashConfirmed,
  catalogPassType,
  heldOf,
  mockRegistrations,
  registrationId,
  saleBackend,
  salePassTypes,
  salePath,
} from './support/registration-mocks.ts';

// Confirmation without payment of a $0 registration (#263) in Nueva inscripción's cash step
// (#346). Reason rules and failure messages are covered by `sale-complimentary-model.test.ts`;
// this spec checks the rendered flow.
const step = (page: Page) => page.getByRole('form', { name: 'Confirmación sin cobro' });
const reasonField = (page: Page) => step(page).getByRole('textbox', { name: 'Motivo' });
const confirmButton = (page: Page) =>
  step(page).getByRole('button', { name: 'Confirmar inscripción' });
const confirmedHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Inscripción confirmada' });

const golden = catalogPassType('e5b2c3d4-1234-4567-89ab-123456789abc', 'Golden ticket', 'full', 0);

// A registration holding only the golden ticket, with it in the catalog.
function goldenBackend() {
  const backend = saleBackend([heldOf(golden)]);
  return {
    ...backend,
    mocks: {
      ...backend.mocks,
      passTypes: () => ({ json: [...Object.values(salePassTypes), golden] }),
    },
  };
}

const confirmed = () => ({ status: 201, json: cashConfirmed(registrationId, 'LMP-G0LD') });

async function openStep(page: Page) {
  await page.goto(salePath(registrationId));
  await expect(page.getByRole('radio', { name: /^Golden ticket/ })).toBeChecked();
  await expect(page.getByRole('form', { name: 'Pase de Ana' })).toContainText('Total$0.00');
  await page.getByRole('button', { name: 'Continuar al cobro' }).click();
  await expect(step(page)).toBeVisible();
}

test('confirms a $0 registration without payment and shows the folio', async ({ page }) => {
  const sent = await mockRegistrations(page, {
    ...goldenBackend().mocks,
    complimentary: confirmed,
  });
  await openStep(page);
  await expect(step(page)).toContainText('Total a cobrar$0.00');
  await expect(step(page).getByRole('textbox', { name: 'Número de recibo' })).toHaveCount(0);
  await expect(step(page).getByRole('textbox', { name: 'Monto recibido (MXN)' })).toHaveCount(0);

  await reasonField(page).fill('  Golden ticket, ganador de la batalla ');
  await expect(step(page)).toContainText('36 de 500 caracteres.');
  await confirmButton(page).click();

  await expect(confirmedHeading(page)).toBeVisible();
  await expect(page.getByRole('main')).toContainText('LMP-G0LD');
  await expect(page.getByRole('main')).toContainText('Golden ticket · $0.00');
  expect(sent.complimentary).toEqual([
    {
      registrationId,
      body: { reason: 'Golden ticket, ganador de la batalla' },
      csrf: 'csrf-token',
    },
  ]);
  expect(sent.cash).toHaveLength(0);
});

test('blocks an empty reason before sending', async ({ page }) => {
  const sent = await mockRegistrations(page, {
    ...goldenBackend().mocks,
    complimentary: confirmed,
  });
  await openStep(page);
  await reasonField(page).fill('   ');
  await confirmButton(page).click();

  await expect(step(page)).toContainText('Escribe el motivo de la confirmación sin cobro.');
  await expect(reasonField(page)).toHaveAttribute('aria-invalid', 'true');
  expect(sent.complimentary).toHaveLength(0);
});

test('sends one confirmation when the confirm button is clicked twice at once', async ({
  page,
}) => {
  const sent = await mockRegistrations(page, {
    ...goldenBackend().mocks,
    complimentary: confirmed,
  });
  await openStep(page);
  await reasonField(page).fill('Invitado del jurado');

  // Two clicks in one task land before React re-renders the disabled button.
  await confirmButton(page).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });

  await expect(confirmedHeading(page)).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(sent.complimentary).toHaveLength(1);
});

test('offers a reload when the total is no longer zero and never resends', async ({ page }) => {
  // A priced pass was added elsewhere: only a fresh read shows it.
  const backend = goldenBackend();
  const sent = await mockRegistrations(page, {
    ...backend.mocks,
    complimentary: () => {
      backend.state.held.push(heldOf(salePassTypes.openStyles));
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
  await openStep(page);
  await reasonField(page).fill('Golden ticket');
  await confirmButton(page).click();

  const alert = step(page).getByRole('alert');
  await expect(alert).toContainText(
    'Esta inscripción ya tiene un monto a cobrar. Recarga para registrar el pago en efectivo.',
  );
  await expect(confirmButton(page)).toBeDisabled();
  expect(sent.complimentary).toHaveLength(1);

  await alert.getByRole('button', { name: 'Recargar' }).click();
  const cobro = page.getByRole('form', { name: 'Cobro en efectivo' });
  await expect(cobro.getByRole('textbox', { name: 'Monto recibido (MXN)' })).toHaveValue('800.00');
  await expect(step(page)).toHaveCount(0);
  expect(sent.complimentary).toHaveLength(1);
  expect(sent.cash).toHaveLength(0);
});
