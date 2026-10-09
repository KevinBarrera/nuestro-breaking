import { expect, test } from '@playwright/test';
import { themes, useTheme } from './support/admin-mocks.ts';
import { catalogReply, draftKey, mockPublicCatalog, slug } from './support/public-mocks.ts';

// Theme × screen sweep of the public purchase at phone width: no horizontal scroll and 44px
// targets. Kept apart from the admin sweeps (no admin navigation here); like them, pull requests
// skip it and every push to dev runs it.
const width = 375;

const draft = {
  version: 1,
  selection: {
    passTypeIds: ['breaking', 'open-styles'],
    selectedActivityIds: { breaking: ['breaking-0', 'breaking-2'] },
  },
  buyer: {
    firstName: 'Ana',
    firstLastName: 'López',
    secondLastName: 'Hernández',
    stageName: 'B-girl Ana con un nombre artístico largo',
    email: 'ana.lopez.hernandez@ejemplo.com',
    phone: '33 1234 5678',
  },
};

const reserved = {
  version: 1,
  passes: [
    { name: 'Pase completo Breaking', priceCents: 200000 },
    { name: 'Open Styles', priceCents: 80000 },
  ],
  totalCents: 280000,
  email: 'ana.lopez.hernandez@ejemplo.com',
};

const screens = [
  { name: 'Inicio', path: `/e/${slug}`, heading: /Los más pesados/ },
  { name: 'Pases', path: `/e/${slug}/pases`, heading: 'Elige tus pases' },
  { name: 'Competencias', path: `/e/${slug}/competencias`, heading: 'Elige tus competencias' },
  { name: 'Datos', path: `/e/${slug}/datos`, heading: 'Tus datos' },
  { name: 'Revisar', path: `/e/${slug}/revisar`, heading: 'Revisa y paga' },
  { name: 'Reservada', path: `/e/${slug}/reservada`, heading: 'Reservamos tu inscripción' },
];

// Inline links inside a sentence (the document links in the legal checkboxes) are exempt from
// the target size; the whole checkbox row is their 44px target.
const targets = 'a:not(label a), button, summary, input:not([type="checkbox"]), label:has(input)';

for (const theme of themes) {
  for (const screen of screens) {
    test(`${screen.name} fits ${width}px with 44px targets in the ${theme} theme`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await useTheme(page, theme);
      await page.addInitScript(
        ([key, value, reservedValue]) => {
          sessionStorage.setItem(key, value);
          sessionStorage.setItem(key.replace('draft', 'reserved'), reservedValue);
        },
        [draftKey, JSON.stringify(draft), JSON.stringify(reserved)],
      );
      await mockPublicCatalog(page, catalogReply());
      await page.goto(screen.path);
      await expect(page).toHaveURL(screen.path);
      await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const details = page.locator('summary');
      if (await details.count()) await details.first().click();

      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      for (const target of await page.locator(targets).all()) {
        if (!(await target.isVisible())) continue;
        const box = await target.boundingBox();
        const name = (await target.getAttribute('id')) ?? (await target.textContent()) ?? '';
        expect(box!.height, name).toBeGreaterThanOrEqual(44);
        expect(box!.x + box!.width, name).toBeLessThanOrEqual(width);
      }
    });
  }
}
