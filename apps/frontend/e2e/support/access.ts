import { expect, type Locator, type Page } from '@playwright/test';

// Helpers for the pass access rows: each activity has a radio group named
// "Acceso a <activity>" with the options "Sin acceso", "Elegible" and "Incluida".
export const accessControl = (scope: Page | Locator, name: string) =>
  scope.getByRole('radiogroup', { name, exact: true });

export async function chooseAccess(control: Locator, option: string) {
  await control.getByRole('radio', { name: option, exact: true }).check();
}

export async function expectAccess(control: Locator, option: string) {
  await expect(control.getByRole('radio', { name: option, exact: true })).toBeChecked();
}
