import { expect, test, type Page } from '@playwright/test';
import {
  cashConfirmed,
  heldOf,
  mockRegistrations,
  registrationId,
  registrationPath,
  saleActivities,
  saleBackend,
  salePassTypes,
  salePath,
} from './support/registration-mocks.ts';

// Nueva inscripción's cash step (#105, #346). The amount hint, form checks and failure messages
// are covered by `new-registration-model.test.ts` and `sale-cash-model.test.ts`; this spec checks
// the rendered flow on the sale route of a pending registration.
const cobro = (page: Page) => page.getByRole('form', { name: 'Cobro en efectivo' });
const amountField = (page: Page) =>
  cobro(page).getByRole('textbox', { name: 'Monto recibido (MXN)' });
const receiptField = (page: Page) => cobro(page).getByRole('textbox', { name: 'Número de recibo' });
const confirmButton = (page: Page) =>
  cobro(page).getByRole('button', { name: 'Confirmar inscripción' });
const confirmedHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Inscripción confirmada' });

// A full pass with one competition and the add-on: $2,800.00.
const held = () => [
  heldOf(salePassTypes.popping, [saleActivities.popping1.id]),
  heldOf(salePassTypes.openStyles),
];

const receiptTaken = {
  status: 409,
  json: {
    statusCode: 409,
    message: 'Receipt number is already used in this event',
    code: 'receipt_taken',
  },
};

async function openCobro(page: Page) {
  // Opened directly, as after a reload: no contact line is known.
  await page.goto(salePath(registrationId));
  await page.getByRole('button', { name: 'Continuar al cobro' }).click();
  await expect(cobro(page)).toBeVisible();
}

test('confirms the typed amount once and shows the folio', async ({ page }) => {
  const sent = await mockRegistrations(page, {
    ...saleBackend(held()).mocks,
    cash: () => ({ status: 201, json: cashConfirmed(registrationId, 'LMP-7K3Q') }),
  });
  await openCobro(page);
  // Nothing held changed, so nothing was written before the cash step.
  expect([...sent.addedPasses, ...sent.removedPasses, ...sent.selections]).toEqual([]);

  await expect(cobro(page)).toContainText('Ana López');
  await expect(cobro(page)).toContainText('Total a cobrar$2,800.00');
  await expect(amountField(page)).toHaveValue('2800.00');
  await expect(cobro(page)).toContainText('Coincide con el total.');

  // A missing receipt and an unreadable amount are caught before sending.
  await amountField(page).fill('dos mil');
  await confirmButton(page).click();
  await expect(cobro(page)).toContainText('Escribe un monto válido, por ejemplo 1500 o 1500.50.');
  await expect(cobro(page)).toContainText('Escribe el número impreso en el recibo.');
  await expect(receiptField(page)).toHaveAttribute('aria-invalid', 'true');
  expect(sent.cash).toHaveLength(0);

  // A different amount only warns.
  await amountField(page).fill('3000');
  await expect(cobro(page)).toContainText(
    'No coincide con el total ($2,800.00). Puedes continuar si así dice el recibo.',
  );
  await receiptField(page).fill('  A-17 ');
  await cobro(page).getByRole('textbox', { name: 'Nota (opcional)' }).fill('Billetes de 500');
  await confirmButton(page).click();

  await expect(confirmedHeading(page)).toBeVisible();
  expect(sent.cash).toEqual([
    {
      registrationId,
      body: { amount: 300000, receipt: 'A-17', note: 'Billetes de 500' },
      csrf: 'csrf-token',
    },
  ]);
  const main = page.getByRole('main');
  await expect(main).toContainText('LMP-7K3Q');
  // Without the participant step, the email is unknown.
  await expect(main).toContainText(
    'La inscripción de Ana López quedó lista. Le enviamos la confirmación y el folio a su correo.',
  );
  await page.getByRole('link', { name: 'Ver inscripción' }).click();
  await expect(page).toHaveURL(registrationPath(registrationId));
});

test('shows a taken receipt number on the receipt field', async ({ page }) => {
  const sent = await mockRegistrations(page, {
    ...saleBackend(held()).mocks,
    cash: (attempt) =>
      attempt === 1
        ? receiptTaken
        : { status: 201, json: cashConfirmed(registrationId, 'LMP-7K3Q') },
  });
  await openCobro(page);
  await receiptField(page).fill('A-17');
  await confirmButton(page).click();

  await expect(receiptField(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(cobro(page)).toContainText(
    'Ese número de recibo ya está registrado en este evento. Revisa el recibo en papel.',
  );
  await expect(cobro(page).getByRole('button', { name: 'Recargar' })).toHaveCount(0);

  await receiptField(page).fill('A-18');
  await expect(receiptField(page)).not.toHaveAttribute('aria-invalid');
  await confirmButton(page).click();
  await expect(confirmedHeading(page)).toBeVisible();
  expect(sent.cash.map((cash) => cash.body)).toEqual([
    { amount: 280000, receipt: 'A-17' },
    { amount: 280000, receipt: 'A-18' },
  ]);
});

test('never resends a payment whose answer was lost and offers a reload', async ({ page }) => {
  // The lost POST did confirm the registration: only a fresh read shows it.
  const backend = saleBackend(held());
  const sent = await mockRegistrations(page, {
    ...backend.mocks,
    cash: () => {
      backend.state.summary = { status: 'confirmed', folio: 'LMP-7K3Q' };
      return { abort: true };
    },
  });
  await openCobro(page);
  await receiptField(page).fill('A-17');
  await confirmButton(page).click();

  const alert = cobro(page).getByRole('alert');
  await expect(alert).toContainText(
    'No pudimos confirmar si el pago se registró. Recarga la inscripción antes de intentarlo de nuevo.',
  );
  await expect(confirmButton(page)).toBeDisabled();
  expect(sent.cash).toHaveLength(1);

  await alert.getByRole('button', { name: 'Recargar' }).click();
  const notice = page.getByRole('main').getByRole('status').filter({ hasText: 'Sin venta' });
  await expect(notice).toContainText('Esta inscripción ya no está pendiente de pago');
  await expect(notice.getByRole('link', { name: 'Ver inscripción' })).toHaveAttribute(
    'href',
    registrationPath(registrationId),
  );
  expect(sent.cash).toHaveLength(1);
});

test('sends one payment when the confirm button is clicked twice at once', async ({ page }) => {
  const sent = await mockRegistrations(page, {
    ...saleBackend(held()).mocks,
    cash: () => ({ status: 201, json: cashConfirmed(registrationId, 'LMP-7K3Q') }),
  });
  await openCobro(page);
  await receiptField(page).fill('A-17');

  // Two clicks in one task land before React re-renders the disabled button.
  await confirmButton(page).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });

  await expect(confirmedHeading(page)).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(sent.cash).toHaveLength(1);
});

test('goes back to the passes from the cash step', async ({ page }) => {
  await mockRegistrations(page, saleBackend(held()).mocks);
  await openCobro(page);
  await cobro(page).getByRole('button', { name: 'Atrás' }).click();
  await expect(page.getByRole('heading', { name: 'Pase de Ana' })).toBeFocused();
  await expect(page.getByRole('radio', { name: /^Pase completo Popping/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /^Open Styles/ })).toBeChecked();
});

test('shows a voided registration as read-only', async ({ page }) => {
  const sent = await mockRegistrations(page, saleBackend(held(), { status: 'voided' }).mocks);
  await page.goto(registrationPath(registrationId));
  await expect(page.getByRole('main')).toContainText('Inscripción anulada');
  await expect(page.getByRole('main')).toContainText(
    'Esta inscripción está anulada: no admite pases, competencias ni pagos.',
  );
  await expect(page.getByRole('region', { name: 'Pases' })).toContainText('Pase completo Popping');
  await expect(page.getByRole('region', { name: 'Venta pendiente' })).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('textbox')).toHaveCount(0);

  // Its sale route does not sell either.
  await page.goto(salePath(registrationId));
  await expect(page.getByRole('main')).toContainText(
    'Esta inscripción ya no está pendiente de pago',
  );
  await expect(page.getByRole('main').getByRole('textbox')).toHaveCount(0);
  expect(sent.cash).toHaveLength(0);
});
