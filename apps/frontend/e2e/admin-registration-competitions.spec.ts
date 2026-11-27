import { expect, test, type Page } from '@playwright/test';
import {
  catalogActivity,
  catalogPassType,
  heldOf,
  heldPass,
  mockRegistrations,
  registrationId,
  registrationPath,
  registrationSummary,
  saleActivities,
  saleBackend,
  salePassTypes,
  salePath,
} from './support/registration-mocks.ts';

// Competitions of each pass (#105, #170, #277, #346). Which activities are offered and the failure
// messages are covered by `new-registration-model.test.ts` and `sale-competitions-model.test.ts`;
// this spec checks the sale's pass step and the confirmed view.
const passStep = (page: Page) => page.getByRole('form', { name: 'Pase de Ana' });
const poppingGroup = (page: Page) =>
  passStep(page).getByRole('group', { name: 'Categorías de Pase completo Popping' });
const next = (page: Page) => passStep(page).getByRole('button', { name: 'Continuar al cobro' });

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

test('the confirmed view tells included competitions apart from chosen ones', async ({ page }) => {
  const openStyles = catalogActivity(
    'b4b2c3d4-1234-4567-89ab-123456789abc',
    'Open Styles 1 vs 1',
    '2026-11-14T19:00:00Z',
  );
  const addOn = catalogPassType(
    'f4b2c3d4-1234-4567-89ab-123456789abc',
    'Open Styles',
    'add_on',
    20000,
    { activities: [{ activityId: openStyles.id, access: 'included' }] },
  );
  const heldAddOn = {
    registrationPassId: 'f7b2c3d4-1234-4567-89ab-123456789abc',
    passTypeId: addOn.id,
    name: 'Open Styles',
    passClass: 'add_on',
    priceCents: 20000,
    selections: [],
  };
  await mockRegistrations(page, {
    entitlements: (id) => ({
      json: {
        registration: registrationSummary(id, { status: 'confirmed', folio: 'LMP-7K3Q' }),
        passes: [{ ...heldPass, selections: [breaking.id] }, heldAddOn],
        accessibleActivityIds: [breaking.id, openStyles.id],
      },
    }),
    passTypes: () => ({ json: [full, addOn] }),
    activities: () => ({ json: [breaking, popping, locking, openStyles] }),
  });
  await page.goto(registrationPath(registrationId));

  // Included competitions are access, not a choice, so they never read as chosen (#277).
  const rows = page.getByRole('region', { name: 'Pases' }).getByRole('listitem');
  await expect(
    rows.filter({ hasText: 'Pase completo' }).getByRole('list', { name: 'Categorías elegidas' }),
  ).toHaveText('Breaking 1 vs 1');
  const addOnRow = rows.filter({ hasText: 'Open Styles' }).first();
  await expect(addOnRow.getByRole('list', { name: 'Categorías incluidas' })).toHaveText(
    'Open Styles 1 vs 1',
  );
  await expect(addOnRow).not.toContainText('Sin actividades');
  await expect(addOnRow).not.toContainText('Categorías elegidas');
});

test('the confirmed view labels each activity by its kind (#405)', async ({ page }) => {
  const footwork = {
    ...catalogActivity(
      'b5b2c3d4-1234-4567-89ab-123456789abc',
      'Workshop intensivo de footwork',
      '2026-11-14T12:00:00Z',
    ),
    kind: 'workshop',
  };
  const passType = catalogPassType(heldPass.passTypeId, 'Pase completo', 'full', 150000, {
    activities: [
      { activityId: breaking.id, access: 'included' },
      { activityId: footwork.id, access: 'selectable' },
    ],
  });
  await mockRegistrations(page, {
    entitlements: (id) => ({
      json: {
        registration: registrationSummary(id, { status: 'confirmed', folio: 'LMP-7K3Q' }),
        passes: [{ ...heldPass, selections: [footwork.id] }],
        accessibleActivityIds: [breaking.id, footwork.id],
      },
    }),
    passTypes: () => ({ json: [passType] }),
    activities: () => ({ json: [breaking, footwork] }),
  });
  await page.goto(registrationPath(registrationId));

  const row = page.getByRole('region', { name: 'Pases' }).getByRole('listitem').first();
  await expect(row.getByRole('list', { name: 'Categorías incluidas' })).toHaveText(
    'Breaking 1 vs 1',
  );
  await expect(row.getByRole('list', { name: 'Talleres elegidos' })).toHaveText(
    'Workshop intensivo de footwork',
  );
  await expect(row).not.toContainText('Categorías elegidas');
});

test('explains a rejected selection and reloads only when asked', async ({ page }) => {
  let reads = 0;
  const backend = saleBackend([heldOf(salePassTypes.popping)]);
  const sent = await mockRegistrations(page, {
    ...backend.mocks,
    entitlements: (id) => {
      reads += 1;
      return backend.mocks.entitlements!(id);
    },
    selections: () => ({
      status: 400,
      json: { statusCode: 400, message: 'Invalid activity selection' },
    }),
  });
  await page.goto(salePath(registrationId));
  await poppingGroup(page).getByRole('checkbox', { name: 'Popping 2v2' }).check();
  const loaded = reads;
  await next(page).click();

  const alert = passStep(page).getByRole('alert');
  await expect(alert).toContainText(
    'Alguna actividad ya no está disponible para este pase. Recarga para ver las actividades actuales.',
  );
  expect(sent.selections.map((selection) => selection.body)).toEqual([
    { activityIds: [saleActivities.popping2.id] },
  ]);
  // The choice stays so the operator can see what was rejected; nothing is sent again by itself.
  await expect(next(page)).toBeDisabled();
  expect(reads).toBe(loaded);

  // Reloading reads the registration again and keeps the operator's checks (#277).
  await alert.getByRole('button', { name: 'Recargar' }).click();
  await expect(alert).toHaveCount(0);
  expect(reads).toBe(loaded + 1);
  await expect(poppingGroup(page).getByRole('checkbox', { name: 'Popping 2v2' })).toBeChecked();
  expect(sent.selections).toHaveLength(1);
});

test('offers a reload when the activities cannot be read', async ({ page }) => {
  let reloaded = false;
  const backend = saleBackend([heldOf(salePassTypes.popping)]);
  await mockRegistrations(page, {
    ...backend.mocks,
    activities: () => (reloaded ? backend.mocks.activities!() : { abort: true }),
  });
  await page.goto(salePath(registrationId));
  const notice = page.getByRole('alert');
  await expect(notice).toContainText('No pudimos cargar los pases del evento.');
  await expect(page.getByRole('checkbox')).toHaveCount(0);

  reloaded = true;
  await notice.getByRole('button', { name: 'Recargar' }).click();
  await expect(poppingGroup(page).getByRole('checkbox')).toHaveCount(2);
});
