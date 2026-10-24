import { expect, test, type Page } from '@playwright/test';
import {
  catalogActivity,
  catalogPassType,
  heldPass,
  mockRegistrations,
  registrationId,
  registrationPath,
  registrationSummary,
} from './support/registration-mocks.ts';

// Swapping the only full pass for another discipline of the same price (#104). Target filtering,
// reason rules and failure messages are covered by `discipline-swap-model.test.ts`; this spec
// checks the rendered flow.
const section = (page: Page) => page.getByRole('region', { name: 'Cambiar disciplina' });
const openButton = (page: Page) =>
  section(page).getByRole('button', { name: 'Cambiar disciplina' });
const reasonField = (page: Page) => section(page).getByRole('textbox', { name: 'Motivo' });
const reviewButton = (page: Page) => section(page).getByRole('button', { name: 'Revisar cambio' });
const confirmDialog = (page: Page) =>
  page.getByRole('alertdialog', { name: '¿Cambiar «Pase completo» por «Popping»?' });

const poppingId = 'f3b2c3d4-1234-4567-89ab-123456789abc';
const popping1v1 = catalogActivity(
  'b1b2c3d4-1234-4567-89ab-123456789abc',
  'Popping 1 vs 1',
  '2026-11-14T16:00:00Z',
);
const popping2v2 = catalogActivity(
  'b2b2c3d4-1234-4567-89ab-123456789abc',
  'Popping 2 vs 2',
  '2026-11-14T17:00:00Z',
);
const passTypes = [
  catalogPassType(heldPass.passTypeId, heldPass.name, 'full', heldPass.priceCents),
  catalogPassType(poppingId, 'Popping', 'full', heldPass.priceCents, {
    activities: [
      { activityId: popping1v1.id, access: 'selectable' },
      { activityId: popping2v2.id, access: 'selectable' },
    ],
  }),
  // A different current price never qualifies.
  catalogPassType('f4b2c3d4-1234-4567-89ab-123456789abc', 'Locking', 'full', 90000),
];

const confirmed = { status: 'confirmed', folio: 'LMP-7K3Q' } as const;

type Held = Omit<typeof heldPass, 'selections'> & { selections: string[] };

const entitlements = (
  summary: Parameters<typeof registrationSummary>[1] = confirmed,
  pass: Held = heldPass,
) => ({
  json: {
    registration: registrationSummary(registrationId, summary),
    passes: [pass],
    accessibleActivityIds: [],
  },
});

const catalog = {
  passTypes: () => ({ json: passTypes }),
  activities: () => ({ json: [popping1v1, popping2v2] }),
};

test('swaps a confirmed registration to another discipline of the same price', async ({ page }) => {
  const { swaps } = await mockRegistrations(page, {
    ...catalog,
    entitlements: () => entitlements(),
    swap: () =>
      entitlements(confirmed, {
        ...heldPass,
        passTypeId: poppingId,
        name: 'Popping',
        selections: [popping2v2.id],
      }),
  });
  await page.goto(registrationPath(registrationId));

  await openButton(page).click();
  const target = section(page).getByRole('radio', { name: /^Popping/ });
  await expect(target).toBeFocused();
  await expect(section(page).getByRole('radio')).toHaveCount(1);
  await target.check();
  await section(page).getByRole('checkbox', { name: 'Popping 2 vs 2' }).check();
  await reasonField(page).fill('  Pidió cambiar de disciplina  ');
  await reviewButton(page).click();

  await expect(confirmDialog(page)).toContainText(
    'Antes: Pase completo (Sin competencias). Después: Popping (Popping 2 vs 2).',
  );
  await confirmDialog(page).getByRole('button', { name: 'Cambiar disciplina' }).dblclick();

  await expect(section(page).getByRole('status')).toHaveText(
    'Se cambió «Pase completo» por «Popping».',
  );
  await expect(page.getByRole('region', { name: 'Pases' })).toContainText('Popping 2 vs 2');
  await expect(openButton(page)).toBeFocused();
  expect(swaps).toEqual([
    {
      registrationId,
      body: {
        toPassTypeId: poppingId,
        activityIds: [popping2v2.id],
        reason: 'Pidió cambiar de disciplina',
      },
      csrf: 'csrf-token',
    },
  ]);
});

test('blocks a blank reason without calling the API', async ({ page }) => {
  const { swaps } = await mockRegistrations(page, {
    ...catalog,
    entitlements: () => entitlements({ status: 'pending_payment', channel: 'online' }),
  });
  await page.goto(registrationPath(registrationId));

  await openButton(page).click();
  await section(page)
    .getByRole('radio', { name: /^Popping/ })
    .check();
  await reasonField(page).fill('   ');
  await reviewButton(page).click();

  await expect(reasonField(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(section(page)).toContainText('Escribe el motivo del cambio.');
  await expect(reasonField(page)).toBeFocused();
  await expect(confirmDialog(page)).toHaveCount(0);
  expect(swaps).toHaveLength(0);
});

test('shows why a checked-in registration cannot be swapped', async ({ page }) => {
  const { swaps } = await mockRegistrations(page, {
    ...catalog,
    entitlements: () => entitlements(),
    swap: () => ({
      status: 409,
      json: {
        statusCode: 409,
        message: 'Registration is already checked in',
        code: 'discipline_swap_checked_in',
      },
    }),
  });
  await page.goto(registrationPath(registrationId));

  await openButton(page).click();
  await section(page)
    .getByRole('radio', { name: /^Popping/ })
    .check();
  await reasonField(page).fill('Pidió cambiar de disciplina');
  await reviewButton(page).click();
  await confirmDialog(page).getByRole('button', { name: 'Cambiar disciplina' }).click();

  await expect(section(page).getByRole('alert')).toHaveText(
    'Esta persona ya registró su entrada al evento, así que su disciplina ya no se puede cambiar.',
  );
  await expect(confirmDialog(page)).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Pases' })).toContainText('Pase completo');
  expect(swaps).toHaveLength(1);
});

test('offers no swap for a voided registration', async ({ page }) => {
  await mockRegistrations(page, {
    ...catalog,
    entitlements: () => entitlements({ status: 'voided' }),
  });
  await page.goto(registrationPath(registrationId));

  await expect(page.getByText('Inscripción anulada', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Cambiar disciplina' })).toHaveCount(0);
});
