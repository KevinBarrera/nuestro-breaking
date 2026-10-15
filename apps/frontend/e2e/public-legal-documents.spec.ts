import { expect, test } from '@playwright/test';
import { catalogReply, mockPublicCatalog, slug } from './support/public-mocks.ts';

// The three legal documents of the purchase flow (#180): public pages that show their version,
// reachable from the home footer. Their texts are placeholders until the organizer delivers them.
test.use({ viewport: { width: 390, height: 844 } });

const documents = [
  { title: 'Reglamento oficial', path: '/legal/reglamento' },
  { title: 'Aviso de privacidad', path: '/legal/privacidad' },
  { title: 'Política de cancelación', path: '/legal/cancelacion' },
] as const;

for (const { title, path } of documents) {
  test(`${title} shows its version and that the text is provisional`, async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).port === '3000') requests.push(request.url());
    });

    await page.goto(path);

    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByText('Versión: borrador-2026-10-13')).toBeVisible();
    await expect(page.getByRole('status').getByText('Texto provisional')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/');
    // A static page: it needs no API call.
    expect(requests).toEqual([]);
  });
}

test('the home footer opens each legal document', async ({ page }) => {
  await mockPublicCatalog(page, catalogReply());
  await page.goto(`/e/${slug}`);

  await page.getByRole('contentinfo').getByRole('link', { name: 'Aviso de privacidad' }).click();

  await expect(page).toHaveURL('/legal/privacidad');
  await expect(page.getByRole('heading', { level: 1, name: 'Aviso de privacidad' })).toBeVisible();
});
