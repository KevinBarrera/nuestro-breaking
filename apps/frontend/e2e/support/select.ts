import { expect, type Locator, type Page } from '@playwright/test';

// Helpers for the shared React Aria Select: its trigger is a button that opens a listbox
// rendered in a popover at the end of <body>, outside the trigger's region or form.

// The trigger is named by its value followed by its label ("Elegible Pase completo · Taller"),
// so a label matches only at the end of the name.
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const selectTrigger = (scope: Page | Locator, label: string) =>
  scope.getByRole('button', { name: new RegExp(`(^| )${escape(label)}$`) });

export async function chooseOption(trigger: Locator, option: string) {
  await trigger.click();
  const page = trigger.page();
  await page.getByRole('listbox').getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

export async function expectSelected(trigger: Locator, label: string) {
  await expect(trigger).toHaveText(label);
}

// React Aria keeps an aria-hidden, untabbable native <select> for autofill and form
// submission; any other native select would be an unstyled, OS-native control.
export const exposedNativeSelects = (page: Page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('select')].filter(
        (node) => !node.closest('[aria-hidden="true"]'),
      ).length,
  );
