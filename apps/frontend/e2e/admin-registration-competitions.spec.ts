import { expect, test, type Page } from '@playwright/test';
import {
  catalogActivity,
  catalogPassType,
  heldPass,
  mockRegistrations,
  registrationId,
  registrationPath,
} from './support/registration-mocks.ts';

// Competitions of each held pass in the in-person sale (#105). Which activities are offered, the
// draft checks and the failure messages are covered by `sale-competitions-model.test.ts`; this
// spec checks the rendered flow and what the save sends.
const competitions = (page: Page) => page.getByRole('region', { name: 'Competencias' });
const passGroup = (page: Page) => competitions(page).getByRole('group', { name: 'Pase completo' });
const saveButton = (page: Page) =>
  passGroup(page).getByRole('button', { name: 'Guardar competencias' });

const breaking = catalogActivity(
  'b1b2c3d4-1234-4567-89ab-123456789abc',
  'Breaking 1 vs 1',
  '2026-11-14T16:00:00Z',
);
const popping = catalogActivity(
  'b2b2c3d4-1234-4567-89ab-123456789abc',
  'Popping 1 vs 1',
  '2026-11-14T18:00:00Z',
);
const locking = catalogActivity(
  'b3b2c3d4-1234-4567-89ab-123456789abc',
  'Locking 1 vs 1',
  '2026-11-14T20:00:00Z',
);
const full = catalogPassType(heldPass.passTypeId, 'Pase completo', 'full', 150000, {
  activities: [breaking, popping, locking].map(({ id }) => ({
    activityId: id,
    access: 'selectable',
  })),
});
const holding = (selections: string[]) => ({
  json: { passes: [{ ...heldPass, selections }], accessibleActivityIds: selections },
});

test('saves the full list of chosen competitions for a held pass', async ({ page }) => {
  const { selections } = await mockRegistrations(page, {
    entitlements: () => holding([popping.id]),
    passTypes: () => ({ json: [full] }),
    activities: () => ({ json: [locking, popping, breaking] }),
    selections: () => holding([breaking.id, popping.id, locking.id]),
  });
  await page.goto(registrationPath(registrationId));

  const options = passGroup(page).getByRole('checkbox');
  await expect(options).toHaveCount(3);
  await expect(passGroup(page).getByRole('checkbox', { name: 'Popping 1 vs 1' })).toBeChecked();
  await expect(
    passGroup(page).getByRole('checkbox', { name: 'Breaking 1 vs 1' }),
  ).not.toBeChecked();
  // Nothing changed yet, and undoing a change disables it again.
  await expect(saveButton(page)).toBeDisabled();
  await passGroup(page).getByText('Breaking 1 vs 1').click();
  await expect(saveButton(page)).toBeEnabled();
  await passGroup(page).getByText('Breaking 1 vs 1').click();
  await expect(saveButton(page)).toBeDisabled();

  await passGroup(page).getByText('Locking 1 vs 1').click();
  await passGroup(page).getByText('Breaking 1 vs 1').click();
  await saveButton(page).click();
  await expect(passGroup(page).getByRole('status')).toHaveText(
    'Se guardaron las competencias de «Pase completo».',
  );
  // The PUT replaces the list, so it carries every chosen competition, not only the new ones.
  expect(selections).toEqual([
    {
      registrationId,
      registrationPassId: heldPass.registrationPassId,
      body: { activityIds: [breaking.id, popping.id, locking.id] },
      csrf: 'csrf-token',
    },
  ]);
  await expect(passGroup(page).getByRole('checkbox', { name: 'Locking 1 vs 1' })).toBeChecked();
  await expect(saveButton(page)).toBeDisabled();
});

test('keeps unsaved competitions when another pass is added', async ({ page }) => {
  const workshop = catalogPassType(
    'f4b2c3d4-1234-4567-89ab-123456789abc',
    'Taller de popping',
    'add_on',
    20000,
    { requiresPassClass: 'full' },
  );
  const heldWorkshop = {
    registrationPassId: 'f7b2c3d4-1234-4567-89ab-123456789abc',
    passTypeId: workshop.id,
    name: 'Taller de popping',
    passClass: 'add_on',
    priceCents: 20000,
    selections: [],
  };
  const { addedPasses } = await mockRegistrations(page, {
    entitlements: () => holding([]),
    passTypes: () => ({ json: [full, workshop] }),
    activities: () => ({ json: [breaking, popping, locking] }),
    addPass: () => ({
      status: 201,
      json: { passes: [{ ...heldPass, selections: [] }, heldWorkshop], accessibleActivityIds: [] },
    }),
  });
  await page.goto(registrationPath(registrationId));

  await passGroup(page).getByText('Breaking 1 vs 1').click();
  await passGroup(page).getByText('Locking 1 vs 1').click();
  const picker = page.getByRole('region', { name: 'Agregar pase' });
  await picker.getByRole('button', { name: 'Agregar Taller de popping' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Agregar pase' }).click();
  await expect(picker.getByRole('status')).toHaveText('Se agregó «Taller de popping».');
  expect(addedPasses).toHaveLength(1);

  // The answer brings the pass's saved list again; the operator's checks are not lost.
  await expect(passGroup(page).getByRole('checkbox', { name: 'Breaking 1 vs 1' })).toBeChecked();
  await expect(passGroup(page).getByRole('checkbox', { name: 'Locking 1 vs 1' })).toBeChecked();
  await expect(passGroup(page).getByRole('checkbox', { name: 'Popping 1 vs 1' })).not.toBeChecked();
  await expect(saveButton(page)).toBeEnabled();
});

// Unsaved checks hold the confirmation (#277); the hint text is covered by the model tests.
const cashConfirm = (page: Page) =>
  page.getByRole('region', { name: 'Pago en efectivo' }).getByRole('button', {
    name: 'Confirmar pago',
  });
const unsavedHint =
  'Guarda o descarta los cambios de competencias de «Pase completo» antes de confirmar.';
const discardButton = (page: Page) =>
  passGroup(page).getByRole('button', { name: 'Descartar cambios' });

test('discarding unsaved competitions restores the saved checks and allows confirming', async ({
  page,
}) => {
  const { selections } = await mockRegistrations(page, {
    entitlements: () => holding([popping.id]),
    passTypes: () => ({ json: [full] }),
    activities: () => ({ json: [breaking, popping, locking] }),
  });
  await page.goto(registrationPath(registrationId));
  await expect(cashConfirm(page)).toBeEnabled();
  await expect(discardButton(page)).toHaveCount(0);

  await passGroup(page).getByText('Breaking 1 vs 1').click();
  await passGroup(page).getByText('Popping 1 vs 1').click();
  await expect(cashConfirm(page)).toBeDisabled();
  await expect(cashConfirm(page)).toHaveAccessibleDescription(unsavedHint);

  await discardButton(page).click();
  // The button goes away, so focus moves to the pass's first competition instead of the page.
  await expect(passGroup(page).getByRole('checkbox').first()).toBeFocused();
  await expect(passGroup(page).getByRole('checkbox', { name: 'Popping 1 vs 1' })).toBeChecked();
  await expect(
    passGroup(page).getByRole('checkbox', { name: 'Breaking 1 vs 1' }),
  ).not.toBeChecked();
  await expect(discardButton(page)).toHaveCount(0);
  await expect(cashConfirm(page)).toBeEnabled();
  await expect(page.getByText(unsavedHint)).toHaveCount(0);
  expect(selections).toHaveLength(0);
});

test('saving unsaved competitions allows confirming', async ({ page }) => {
  await mockRegistrations(page, {
    entitlements: () => holding([]),
    passTypes: () => ({ json: [full] }),
    activities: () => ({ json: [breaking, popping, locking] }),
    selections: () => holding([breaking.id]),
  });
  await page.goto(registrationPath(registrationId));

  await passGroup(page).getByText('Breaking 1 vs 1').click();
  await expect(cashConfirm(page)).toBeDisabled();
  await saveButton(page).click();
  await expect(passGroup(page).getByRole('status')).toHaveText(
    'Se guardaron las competencias de «Pase completo».',
  );
  await expect(cashConfirm(page)).toBeEnabled();
  await expect(discardButton(page)).toHaveCount(0);
});

test('explains a rejected selection and reloads only when asked', async ({ page }) => {
  let reads = 0;
  const { selections } = await mockRegistrations(page, {
    entitlements: () => {
      reads += 1;
      return holding([]);
    },
    passTypes: () => ({ json: [full] }),
    activities: () => ({ json: [breaking, popping, locking] }),
    selections: () => ({
      status: 400,
      json: { statusCode: 400, message: 'Invalid activity selection' },
    }),
  });
  await page.goto(registrationPath(registrationId));
  await expect(saveButton(page)).toBeDisabled();
  const loaded = reads;

  await passGroup(page).getByText('Popping 1 vs 1').click();
  await saveButton(page).click();
  const alert = passGroup(page).getByRole('alert');
  await expect(alert).toContainText(
    'Alguna competencia ya no está disponible para este pase. Recarga para ver las competencias actuales.',
  );
  expect(selections).toHaveLength(1);
  // The draft stays so the operator can see what was rejected; nothing is sent again by itself.
  await expect(passGroup(page).getByRole('checkbox', { name: 'Popping 1 vs 1' })).toBeChecked();
  expect(reads).toBe(loaded);

  // Reloading reads the registration again but keeps the operator's unsaved checks (#277).
  await alert.getByRole('button', { name: 'Recargar' }).click();
  await expect(passGroup(page).getByRole('alert')).toHaveCount(0);
  expect(reads).toBe(loaded + 1);
  await expect(passGroup(page).getByRole('checkbox', { name: 'Popping 1 vs 1' })).toBeChecked();
  expect(selections).toHaveLength(1);
});

test('offers a reload when the activities cannot be read', async ({ page }) => {
  let reloaded = false;
  await mockRegistrations(page, {
    entitlements: () => holding([]),
    passTypes: () => ({ json: [full] }),
    activities: () => (reloaded ? { json: [breaking, popping, locking] } : { abort: true }),
  });
  await page.goto(registrationPath(registrationId));
  const notice = competitions(page).getByText('No pudimos cargar las competencias del evento.');
  await expect(notice).toBeVisible();
  await expect(competitions(page).getByRole('checkbox')).toHaveCount(0);

  reloaded = true;
  await competitions(page).getByRole('button', { name: 'Recargar' }).click();
  await expect(notice).toHaveCount(0);
  await expect(passGroup(page).getByRole('checkbox')).toHaveCount(3);
});
