import { expect, test, type Page } from '@playwright/test';
import {
  heldOf,
  heldPassId,
  mockRegistrations,
  registrationId,
  registrationSummary,
  saleActivities,
  saleBackend,
  salePassTypes,
  salePath,
} from './support/registration-mocks.ts';

// Nueva inscripción's pass step (#105, #282, #346). Base and add-on rules, the draft, the write
// plan and failure messages are covered by `new-registration-model.test.ts` and the sale models'
// tests; this spec checks the rendered flow and what it sends.
const passStep = (page: Page) => page.getByRole('form', { name: 'Pase de Ana' });
const next = (page: Page) => passStep(page).getByRole('button', { name: 'Continuar al cobro' });
const cobro = (page: Page) => page.getByRole('form', { name: 'Cobro en efectivo' });
const radio = (page: Page, name: string) =>
  passStep(page).getByRole('radio', { name: new RegExp(`^${name}`) });
const addOn = (page: Page) => passStep(page).getByRole('checkbox', { name: /^Open Styles/ });

const { general, popping, breaking, openStyles } = salePassTypes;

test('switches the base pass by removing the add-on and the old pass first', async ({ page }) => {
  const backend = saleBackend([heldOf(popping, [saleActivities.popping1.id]), heldOf(openStyles)]);
  const sent = await mockRegistrations(page, backend.mocks);
  await page.goto(salePath(registrationId));
  await radio(page, 'Entrada general').check();

  // The general entry does not allow the add-on, so it is dropped and disabled.
  await expect(addOn(page)).not.toBeChecked();
  await expect(addOn(page)).toBeDisabled();
  await expect(addOn(page)).toHaveAccessibleDescription('Requiere un pase completo.');
  await expect(passStep(page)).toContainText('Total$1,000.00');
  await next(page).click();

  await expect(cobro(page)).toBeVisible();
  expect(sent.removedPasses).toEqual([
    { registrationId, registrationPassId: heldPassId(openStyles), csrf: 'csrf-token' },
    { registrationId, registrationPassId: heldPassId(popping), csrf: 'csrf-token' },
  ]);
  expect(sent.addedPasses).toEqual([
    { registrationId, body: { passTypeId: general.id }, csrf: 'csrf-token' },
  ]);
  expect(sent.selections).toEqual([]);
  await expect(cobro(page).getByRole('list', { name: 'Pases' })).toHaveText(
    'Entrada generalEntrada al evento$1,000.00',
  );
});

test('changes only the competitions when the passes stay', async ({ page }) => {
  const sent = await mockRegistrations(
    page,
    saleBackend([heldOf(breaking, [saleActivities.breaking.id])]).mocks,
  );
  await page.goto(salePath(registrationId));
  const competitions = passStep(page).getByRole('group', {
    name: 'Competencias de Pase completo Breaking',
  });
  await competitions.getByRole('checkbox', { name: 'Breaking Bboy' }).uncheck();
  await next(page).click();

  await expect(cobro(page)).toBeVisible();
  expect(sent.addedPasses).toEqual([]);
  expect(sent.removedPasses).toEqual([]);
  expect(sent.selections).toEqual([
    {
      registrationId,
      registrationPassId: heldPassId(breaking),
      body: { activityIds: [] },
      csrf: 'csrf-token',
    },
  ]);
  await expect(cobro(page)).toContainText('Sin competencias elegidas');
});

test('does not retry a pass whose answer was lost and offers a reload', async ({ page }) => {
  // The lost POST did add the pass: only a fresh read shows it.
  const backend = saleBackend();
  const sent = await mockRegistrations(page, {
    ...backend.mocks,
    addPass: (attempt, request) => {
      backend.mocks.addPass!(attempt, request);
      return { abort: true };
    },
  });
  await page.goto(salePath(registrationId));
  await radio(page, 'Pase completo Popping').check();
  await next(page).click();

  const alert = passStep(page).getByRole('alert');
  await expect(alert).toContainText(
    'No pudimos confirmar si el pase se agregó. Recarga la inscripción antes de intentarlo de nuevo.',
  );
  await expect(next(page)).toBeDisabled();
  expect(sent.addedPasses).toHaveLength(1);

  await alert.getByRole('button', { name: 'Recargar' }).click();
  await expect(alert).toHaveCount(0);
  await expect(radio(page, 'Pase completo Popping')).toBeChecked();
  await next(page).click();
  await expect(cobro(page)).toBeVisible();
  expect(sent.addedPasses).toHaveLength(1);
});

test('shows that an online registration cannot lose a pass and stays on the step', async ({
  page,
}) => {
  const backend = saleBackend([heldOf(popping)], { channel: 'online' });
  const sent = await mockRegistrations(page, {
    ...backend.mocks,
    removePass: () => ({
      status: 409,
      json: { statusCode: 409, message: 'Online registrations cannot lose a pass' },
    }),
  });
  await page.goto(salePath(registrationId));
  await radio(page, 'Pase completo Breaking').check();
  await next(page).click();

  const alert = passStep(page).getByRole('alert');
  await expect(alert).toContainText(
    'Esta inscripción se hizo en línea: sus pases no se pueden quitar.',
  );
  await expect(alert.getByRole('button', { name: 'Recargar' })).toBeVisible();
  await expect(cobro(page)).toHaveCount(0);
  expect(sent.removedPasses).toHaveLength(1);
  expect(sent.addedPasses).toHaveLength(0);
});

test('offers a reload when the pass types cannot be read', async ({ page }) => {
  let reloaded = false;
  const backend = saleBackend();
  await mockRegistrations(page, {
    ...backend.mocks,
    passTypes: () => (reloaded ? backend.mocks.passTypes!() : { status: 500, json: {} }),
  });
  await page.goto(salePath(registrationId));
  const notice = page.getByRole('alert');
  await expect(notice).toContainText('No pudimos cargar los pases del evento.');

  reloaded = true;
  await notice.getByRole('button', { name: 'Recargar' }).click();
  await expect(radio(page, 'Entrada general')).toBeVisible();
});

test('names the participant from the read when opened without context', async ({ page }) => {
  await mockRegistrations(page, {
    ...saleBackend().mocks,
    entitlements: (id) => ({
      json: {
        registration: registrationSummary(id, {
          fullName: 'Luz Rivera',
          firstName: 'Luz',
          firstLastName: 'Rivera',
        }),
        passes: [],
        accessibleActivityIds: [],
      },
    }),
  });
  await page.goto(salePath(registrationId));
  await expect(page.getByRole('heading', { name: 'Pase de Luz' })).toBeVisible();
});
