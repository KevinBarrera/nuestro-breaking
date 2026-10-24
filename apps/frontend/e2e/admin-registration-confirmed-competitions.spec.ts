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

// Changing the competitions of a confirmed registration with a reason (#170). The reason rules,
// change detection, confirmation copy and failure messages are covered by
// `confirmed-competitions-model.test.ts`; this spec checks the rendered flow and what is sent.
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
const full = catalogPassType(heldPass.passTypeId, 'Pase completo', 'full', 150000, {
  activities: [breaking, popping].map(({ id }) => ({ activityId: id, access: 'selectable' })),
});
const confirmed = (selections: string[]) => ({
  json: {
    registration: registrationSummary(registrationId, { status: 'confirmed', folio: 'EB-7K3Q' }),
    passes: [{ ...heldPass, selections }],
    accessibleActivityIds: selections,
  },
});
const catalog = {
  entitlements: () => confirmed([popping.id]),
  passTypes: () => ({ json: [full] }),
  activities: () => ({ json: [breaking, popping] }),
};

const passes = (page: Page) => page.getByRole('region', { name: 'Pases' });
const editor = (page: Page) =>
  page.getByRole('form', { name: 'Editar competencias de «Pase completo»' });
const reason = (page: Page) => editor(page).getByRole('textbox', { name: 'Motivo del cambio' });

async function openEditor(page: Page) {
  await page.goto(registrationPath(registrationId));
  await passes(page)
    .getByRole('button', { name: 'Editar competencias de «Pase completo»' })
    .click();
}

test('changes the competitions of a confirmed registration with a reason', async ({ page }) => {
  const { selections } = await mockRegistrations(page, {
    ...catalog,
    selections: () => confirmed([breaking.id]),
  });
  await openEditor(page);

  await expect(editor(page).getByRole('checkbox', { name: 'Popping 1 vs 1' })).toBeChecked();
  await editor(page).getByText('Popping 1 vs 1').click();
  await editor(page).getByText('Breaking 1 vs 1').click();
  await reason(page).fill('  Pidió cambiar de categoría en mesa  ');
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();

  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('¿Cambiar las competencias de «Pase completo»?');
  await expect(dialog).toContainText(
    'Antes: Popping 1 vs 1. Después: Breaking 1 vs 1. Motivo: Pidió cambiar de categoría en mesa.',
  );
  expect(selections).toHaveLength(0);
  // Two quick clicks send one PUT.
  await dialog.getByRole('button', { name: 'Cambiar competencias' }).dblclick();

  await expect(passes(page).getByRole('status')).toHaveText(
    'Se cambiaron las competencias de «Pase completo».',
  );
  await expect(passes(page)).toContainText('Breaking 1 vs 1');
  await expect(editor(page)).toHaveCount(0);
  await expect(
    passes(page).getByRole('button', { name: 'Editar competencias de «Pase completo»' }),
  ).toBeFocused();
  expect(selections).toEqual([
    {
      registrationId,
      registrationPassId: heldPass.registrationPassId,
      body: { activityIds: [breaking.id], reason: 'Pidió cambiar de categoría en mesa' },
      csrf: 'csrf-token',
    },
  ]);
});

test('a blank reason or an unchanged list sends nothing', async ({ page }) => {
  const { selections } = await mockRegistrations(page, catalog);
  await openEditor(page);

  await reason(page).fill('   ');
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(reason(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(editor(page)).toContainText('Escribe el motivo del cambio.');
  await expect(editor(page)).toContainText('Cambia al menos una competencia para guardar.');

  await editor(page).getByText('Breaking 1 vs 1').click();
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(editor(page)).toContainText('Escribe el motivo del cambio.');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(selections).toHaveLength(0);

  // Cancel keeps the saved list.
  await editor(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(passes(page)).toContainText('Popping 1 vs 1');
});

test('a reason the backend rejects shows on the field and keeps the draft', async ({ page }) => {
  const { selections } = await mockRegistrations(page, {
    ...catalog,
    selections: () => ({
      status: 400,
      json: {
        statusCode: 400,
        message: 'Reason is required and must be 1 to 500 characters',
        code: 'selection_change_reason_required',
      },
    }),
  });
  await openEditor(page);

  await editor(page).getByText('Breaking 1 vs 1').click();
  await reason(page).fill('Cambio en mesa');
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cambiar competencias' }).click();

  await expect(editor(page)).toContainText('Escribe un motivo de 1 a 500 caracteres.');
  await expect(reason(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(reason(page)).toHaveValue('Cambio en mesa');
  await expect(editor(page).getByRole('checkbox', { name: 'Breaking 1 vs 1' })).toBeChecked();
  expect(selections).toHaveLength(1);
});

test('a failed change shows an alert and keeps the draft', async ({ page }) => {
  await mockRegistrations(page, {
    ...catalog,
    selections: () => ({ status: 500, json: { statusCode: 500, message: 'Internal' } }),
  });
  await openEditor(page);

  await editor(page).getByText('Breaking 1 vs 1').click();
  await reason(page).fill('Cambio en mesa');
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cambiar competencias' }).click();

  await expect(editor(page).getByRole('alert')).toHaveText(
    'No pudimos guardar las competencias. Intenta de nuevo.',
  );
  await expect(reason(page)).toHaveValue('Cambio en mesa');
  await expect(editor(page).getByRole('checkbox', { name: 'Breaking 1 vs 1' })).toBeChecked();
});

test('a voided registration offers no competition changes', async ({ page }) => {
  await mockRegistrations(page, {
    ...catalog,
    entitlements: () => ({
      json: {
        registration: registrationSummary(registrationId, { status: 'voided' }),
        passes: [{ ...heldPass, selections: [popping.id] }],
        accessibleActivityIds: [],
      },
    }),
  });
  await page.goto(registrationPath(registrationId));
  await expect(page.getByText('Inscripción anulada', { exact: true })).toBeVisible();
  await expect(passes(page)).toContainText('Popping 1 vs 1');
  await expect(passes(page).getByRole('button')).toHaveCount(0);
});
