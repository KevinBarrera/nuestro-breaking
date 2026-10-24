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

// Swapping the only full pass for another discipline of the same price (#104) in the two-step modal
// (#345). Target filtering, reason rules, review rows and failure messages are covered by
// `discipline-swap-model.test.ts`; this spec checks the rendered flow.
const passes = (page: Page) => page.getByRole('region', { name: 'Pases' });
const openButton = (page: Page) => passes(page).getByRole('button', { name: 'Cambiar disciplina' });
const dialog = (page: Page) => page.getByRole('dialog');
const reasonField = (page: Page) => dialog(page).getByRole('textbox', { name: 'Motivo' });
const reviewButton = (page: Page) => dialog(page).getByRole('button', { name: 'Revisar cambios' });
const confirmButton = (page: Page) =>
  dialog(page).getByRole('button', { name: 'Cambiar disciplina' });

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
  const target = dialog(page).getByRole('radio', { name: /^Popping/ });
  await expect(target).toBeFocused();
  await expect(dialog(page).getByRole('radio')).toHaveCount(1);
  await target.check();
  await dialog(page).getByRole('checkbox', { name: 'Popping 2 vs 2' }).check();
  await reasonField(page).fill('  Pidió cambiar de disciplina  ');
  await reviewButton(page).click();

  await expect(dialog(page).getByRole('table', { name: 'Cambios' }).getByRole('row')).toHaveText([
    'DatoAntesDespués',
    'PasePase completoPopping',
    'CompetenciasNingunaPopping 2 vs 2',
  ]);
  await expect(dialog(page)).toContainText(
    'El monto cobrado no cambia: los dos pases cuestan lo mismo.',
  );
  expect(swaps).toHaveLength(0);
  await confirmButton(page).dblclick();

  await expect(dialog(page)).toHaveCount(0);
  await expect(passes(page).getByRole('status')).toHaveText(
    'Se cambió a «Popping». El monto cobrado no cambia.',
  );
  await expect(passes(page)).toContainText('Popping 2 vs 2');
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

test('asks for a pass and a reason without calling the API', async ({ page }) => {
  const { swaps } = await mockRegistrations(page, {
    ...catalog,
    entitlements: () => entitlements({ status: 'pending_payment', channel: 'online' }),
  });
  await page.goto(registrationPath(registrationId));

  await openButton(page).click();
  await reviewButton(page).click();
  await expect(dialog(page)).toContainText('Elige el pase al que cambia.');

  await dialog(page)
    .getByRole('radio', { name: /^Popping/ })
    .check();
  await reasonField(page).fill('   ');
  await reviewButton(page).click();
  await expect(reasonField(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog(page)).toContainText('Escribe el motivo. Queda en el historial.');
  await expect(reasonField(page)).toBeFocused();
  await expect(dialog(page)).toContainText('Paso 1 de 2 · Cambios');
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
  await dialog(page)
    .getByRole('radio', { name: /^Popping/ })
    .check();
  await reasonField(page).fill('Pidió cambiar de disciplina');
  await reviewButton(page).click();
  await confirmButton(page).click();

  await expect(dialog(page).getByRole('alert')).toHaveText(
    'Esta persona ya registró su entrada al evento, así que su disciplina ya no se puede cambiar.',
  );
  await expect(dialog(page)).toContainText('Paso 1 de 2 · Cambios');
  await dialog(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(passes(page)).toContainText('Pase completo');
  expect(swaps).toHaveLength(1);
});

test('explains when no other full pass costs the same', async ({ page }) => {
  await mockRegistrations(page, {
    passTypes: () => ({ json: [passTypes[0], passTypes[2]] }),
    activities: () => ({ json: [] }),
    entitlements: () => entitlements(),
  });
  await page.goto(registrationPath(registrationId));

  await openButton(page).click();
  await expect(dialog(page)).toContainText(
    'El cambio de disciplina solo se hace entre pases del mismo precio actual.',
  );
  await expect(reviewButton(page)).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Cerrar' }).click();
  await expect(dialog(page)).toHaveCount(0);
});

test('offers no swap for a voided registration', async ({ page }) => {
  await mockRegistrations(page, {
    ...catalog,
    entitlements: () => entitlements({ status: 'voided' }),
  });
  await page.goto(registrationPath(registrationId));

  await expect(page.getByText('Inscripción anulada', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cambiar disciplina' })).toHaveCount(0);
});
