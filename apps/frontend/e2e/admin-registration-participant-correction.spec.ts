import { expect, test, type Page } from '@playwright/test';
import {
  heldPass,
  mockRegistrations,
  registrationId,
  registrationPath,
  registrationSummary,
} from './support/registration-mocks.ts';

// Correcting the participant's name and AKA with a reason (#104) in the two-step modal (#345). Field
// and reason rules, change detection, the review rows and failure messages are covered by
// `participant-correction-model.test.ts`; this spec checks the rendered flow.
const section = (page: Page) => page.getByRole('region', { name: 'Participante' });
const openButton = (page: Page) =>
  section(page).getByRole('button', { name: 'Corregir nombre o AKA' });
const dialog = (page: Page) => page.getByRole('dialog');
const field = (page: Page, name: string) =>
  dialog(page).getByRole('textbox', { name, exact: true });
const reviewButton = (page: Page) => dialog(page).getByRole('button', { name: 'Revisar cambios' });
const changes = (page: Page) => dialog(page).getByRole('table', { name: 'Cambios' });

const confirmed = { status: 'confirmed', folio: 'LMP-7K3Q' } as const;

const entitlements = (summary: Parameters<typeof registrationSummary>[1] = {}) => ({
  json: {
    registration: registrationSummary(registrationId, summary),
    passes: [heldPass],
    accessibleActivityIds: [],
  },
});

const corrected = entitlements({
  ...confirmed,
  fullName: 'Ana María López',
  firstName: 'Ana María',
  stageName: 'Bgirl Ana',
});

test('corrects the name and AKA of a confirmed registration', async ({ page }) => {
  const { corrections } = await mockRegistrations(page, {
    entitlements: () => entitlements(confirmed),
    correction: () => corrected,
  });
  await page.goto(registrationPath(registrationId));

  await expect(section(page)).toContainText('Ana López');
  await openButton(page).click();
  await expect(field(page, 'Nombre(s)')).toBeFocused();
  await expect(field(page, 'Nombre(s)')).toHaveValue('Ana');
  await expect(field(page, 'Primer apellido')).toHaveValue('López');
  await field(page, 'Nombre(s)').fill('Ana María');
  await field(page, 'AKA (opcional)').fill('Bgirl Ana');
  await field(page, 'Motivo').fill('  Error de captura  ');
  await reviewButton(page).click();
  await expect(changes(page).getByRole('row')).toHaveText([
    'DatoAntesDespués',
    'Nombre(s)AnaAna María',
    'AKASin datoBgirl Ana',
  ]);
  await dialog(page).getByRole('button', { name: 'Guardar corrección' }).dblclick();

  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ana María López');
  await expect(section(page).getByRole('status')).toHaveText(
    'Se corrigió el nombre de la inscripción.',
  );
  await expect(section(page)).toContainText('Bgirl Ana');
  await expect(openButton(page)).toBeFocused();
  expect(corrections).toEqual([
    {
      registrationId,
      body: {
        firstName: 'Ana María',
        firstLastName: 'López',
        secondLastName: '',
        stageName: 'Bgirl Ana',
        reason: 'Error de captura',
      },
      csrf: 'csrf-token',
    },
  ]);
});

test('blocks a blank reason or no change without calling the API', async ({ page }) => {
  const { corrections } = await mockRegistrations(page, {
    entitlements: () => entitlements(confirmed),
  });
  await page.goto(registrationPath(registrationId));

  await openButton(page).click();
  await field(page, 'Motivo').fill('Error de captura');
  await reviewButton(page).click();
  await expect(dialog(page)).toContainText('No hay cambios que guardar. Modifica algo o cancela.');

  await field(page, 'Nombre(s)').fill('Ana María');
  await field(page, 'Motivo').fill('   ');
  await reviewButton(page).click();
  await expect(field(page, 'Motivo')).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog(page)).toContainText('Escribe el motivo. Queda en el historial.');
  await expect(field(page, 'Motivo')).toBeFocused();
  expect(corrections).toHaveLength(0);
});

test('asks to confirm in the review when the person is in other events', async ({ page }) => {
  const { corrections } = await mockRegistrations(page, {
    entitlements: () => entitlements(),
    correction: (attempt) =>
      attempt === 1
        ? {
            status: 409,
            json: {
              statusCode: 409,
              message: 'The participant is registered in other events',
              code: 'cross_event_confirmation_required',
              otherEventCount: 2,
            },
          }
        : entitlements({ fullName: 'Ana María López', firstName: 'Ana María' }),
  });
  await page.goto(registrationPath(registrationId));

  await openButton(page).click();
  await field(page, 'Nombre(s)').fill('Ana María');
  await field(page, 'Motivo').fill('Error de captura');
  await reviewButton(page).click();
  await dialog(page).getByRole('button', { name: 'Guardar corrección' }).click();

  await expect(dialog(page)).toContainText(
    'Esta persona aparece en 2 eventos más. Esos registros no cambian. La corrección solo se guarda en esta inscripción.',
  );
  await dialog(page).getByRole('button', { name: 'Confirmar corrección' }).click();

  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ana María López');
  expect(corrections.map(({ body }) => body)).toEqual([
    {
      firstName: 'Ana María',
      firstLastName: 'López',
      secondLastName: '',
      stageName: '',
      reason: 'Error de captura',
    },
    {
      firstName: 'Ana María',
      firstLastName: 'López',
      secondLastName: '',
      stageName: '',
      reason: 'Error de captura',
      confirmCrossEvent: true,
    },
  ]);
});

test('locks the correction after a rejection and offers a reload', async ({ page }) => {
  const { corrections } = await mockRegistrations(page, {
    entitlements: () => entitlements(confirmed),
    correction: () => ({
      status: 409,
      json: { statusCode: 409, message: 'Registration is voided', code: 'registration_voided' },
    }),
  });
  await page.goto(registrationPath(registrationId));

  await openButton(page).click();
  await field(page, 'Nombre(s)').fill('Ana María');
  await field(page, 'Motivo').fill('Error de captura');
  await reviewButton(page).click();
  await dialog(page).getByRole('button', { name: 'Guardar corrección' }).click();

  await expect(dialog(page).getByRole('alert')).toContainText(
    'Esta inscripción se anuló y ya no se puede corregir.',
  );
  await expect(dialog(page).getByRole('button', { name: 'Guardar corrección' })).toBeDisabled();
  await dialog(page).getByRole('button', { name: 'Recargar' }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(corrections).toHaveLength(1);
});

test('offers no correction for a voided registration', async ({ page }) => {
  await mockRegistrations(page, { entitlements: () => entitlements({ status: 'voided' }) });
  await page.goto(registrationPath(registrationId));

  await expect(page.getByText('Inscripción anulada', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Corregir nombre o AKA' })).toHaveCount(0);
});
