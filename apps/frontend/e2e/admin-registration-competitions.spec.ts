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

  await alert.getByRole('button', { name: 'Recargar' }).click();
  await expect(passGroup(page).getByRole('checkbox', { name: 'Popping 1 vs 1' })).not.toBeChecked();
  await expect(passGroup(page).getByRole('alert')).toHaveCount(0);
  expect(reads).toBe(loaded + 1);
  expect(selections).toHaveLength(1);
});
