import { expect, test } from '@playwright/test';

// The browser tab, home-screen and installed-app icons are the event's graffiti logo.
test('serves the event logo as the favicon, touch icon and app icons', async ({
  page,
  request,
}) => {
  await page.goto('/');

  const head = page.locator('head');
  const icons = await head.locator('link[rel="icon"]').evaluateAll((links) =>
    links.map((link) => ({
      href: link.getAttribute('href'),
      sizes: link.getAttribute('sizes'),
      type: link.getAttribute('type'),
    })),
  );
  expect(icons).toEqual([
    { href: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    { href: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
  ]);
  await expect(head.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    '/apple-touch-icon.png',
  );
  await expect(head.locator('link[rel="manifest"]')).toHaveAttribute('href', '/site.webmanifest');

  const manifest: unknown = await (await request.get('/site.webmanifest')).json();
  expect(manifest).toMatchObject({
    name: 'Los más pesados',
    short_name: 'Los más pesados',
    icons: [
      { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  });

  // Every referenced file is a real PNG (or the legacy .ico), not the SPA's HTML fallback.
  for (const path of [
    '/favicon-16x16.png',
    '/favicon-32x32.png',
    '/apple-touch-icon.png',
    '/android-chrome-192x192.png',
    '/android-chrome-512x512.png',
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect([...(await response.body()).subarray(1, 4)], path).toEqual([0x50, 0x4e, 0x47]);
  }
  const ico = await request.get('/favicon.ico');
  expect(ico.status()).toBe(200);
  expect([...(await ico.body()).subarray(0, 4)]).toEqual([0, 0, 1, 0]);
});
