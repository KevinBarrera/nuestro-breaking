import { expect, test, type Page } from '@playwright/test';
import {
  adminScreens,
  mockAdminApi,
  revealControls,
  themes,
  useTheme,
} from './support/admin-mocks.ts';

type Rgba = [number, number, number, number];

// Text/background token pairs used by the admin UI. Every pair carries normal-size text,
// so all need 4.5:1 (WCAG AA); none relies on the 3:1 large-text allowance.
const surfaces = ['surface', 'surface-inner', 'input-bg'];
const textOnSurfaces = ['fg', 'heading', 'muted', 'link', 'link-hover'];
const tokenPairs: [string, string][] = [
  ...surfaces.flatMap((bg) => textOnSurfaces.map((fg): [string, string] => [fg, bg])),
  ['fg', 'chip'],
  ['muted', 'chip'],
  ['fg', 'row'],
  ['header-fg', 'header-bg'],
  ['header-muted', 'header-bg'],
  ['header-fg', 'header-control'],
  ['eligible-fg', 'eligible-bg'],
  ['included-fg', 'included-bg'],
  ['success-fg', 'success-bg'],
  ['warning-fg', 'warning-bg'],
  ['danger-fg', 'danger-bg'],
  ['nav-active-fg', 'nav-active-bg'],
];
// Text placed straight on the page gradient or the translucent side navigation.
const pageText = ['fg', 'heading', 'muted', 'link'];

function luminance([r, g, b]: Rgba) {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgba, b: Rgba) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function over([r, g, b, a]: Rgba, [br, bg, bb]: Rgba): Rgba {
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];
}

// Resolves tokens through the browser so the check reads the shipped CSS, not a copy of it.
async function readTokens(page: Page, names: string[]) {
  return page.evaluate((tokens) => {
    const probe = document.createElement('span');
    document.body.append(probe);
    const parse = (value: string) => {
      probe.style.color = value;
      const computed = getComputedStyle(probe).color;
      if (!/^rgba?\(/.test(computed)) throw new Error(`Unsupported color format: ${computed}`);
      const parts = computed.match(/[\d.]+/g)!.map(Number);
      return [parts[0], parts[1], parts[2], parts[3] ?? 1] as [number, number, number, number];
    };
    const root = getComputedStyle(document.documentElement);
    // A missing token would make var() inherit the body color and measure the wrong pair.
    const missing = tokens.filter((name) => root.getPropertyValue(`--nb-${name}`).trim() === '');
    if (missing.length > 0) throw new Error(`Missing theme tokens: ${missing.join(', ')}`);
    const colors = Object.fromEntries(tokens.map((name) => [name, parse(`var(--nb-${name})`)]));
    const stops = root
      .getPropertyValue('--nb-page')
      .match(/#[0-9a-f]{6}/gi)!
      .map(parse);
    probe.remove();
    return { colors, stops };
  }, names);
}

for (const theme of themes) {
  test(`${theme} theme text tokens meet 4.5:1 contrast`, async ({ page }) => {
    await useTheme(page, theme);
    await mockAdminApi(page);
    await page.goto(adminScreens[0].path);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const names = [...new Set([...tokenPairs.flat(), ...pageText, 'sidenav-bg'])];
    const { colors, stops } = await readTokens(page, names);
    expect(stops.length).toBeGreaterThanOrEqual(3);

    const failures: string[] = [];
    const check = (label: string, fg: Rgba, bg: Rgba) => {
      const ratio = contrast(fg, bg);
      if (ratio < 4.5) failures.push(`${label}: ${ratio.toFixed(2)}`);
    };
    for (const [fg, bg] of tokenPairs) {
      expect(colors[bg][3], `${bg} must be opaque`).toBe(1);
      check(`${fg} on ${bg}`, colors[fg], colors[bg]);
    }
    stops.forEach((stop, index) => {
      for (const fg of pageText) {
        check(`${fg} on page stop ${index}`, colors[fg], stop);
        check(`${fg} on side nav over stop ${index}`, colors[fg], over(colors['sidenav-bg'], stop));
      }
    });
    // Primary actions use the event magenta with ink text in both themes.
    const primary = page.getByRole('link', { name: /Abrir check-in/ });
    const [fg, bg] = await primary.evaluate((node) => [
      getComputedStyle(node).color,
      getComputedStyle(node).backgroundColor,
    ]);
    const rgba = (value: string) => [...value.match(/[\d.]+/g)!.map(Number), 1].slice(0, 4) as Rgba;
    check('primary action', rgba(fg), rgba(bg));
    expect(failures).toEqual([]);
  });
}

// Every visible control an operator taps must offer a 44px-tall target. Inline links inside
// running text are exempt (WCAG 2.5.8 inline exception); checkboxes and radios are measured
// through their wrapping label, which is the real hit area.
for (const screen of adminScreens) {
  test(`${screen.name} keeps 44px targets for shell and page controls`, async ({ page }) => {
    await mockAdminApi(page);
    await page.goto(screen.path);
    await revealControls(page, screen.name);
    const targets = await page.evaluate(() => {
      const selector = 'a[href], button, select, input, textarea, [role="button"]';
      return [...document.querySelectorAll<HTMLElement>(selector)]
        .filter(
          (node) =>
            node.getClientRects().length > 0 && !(node.tagName === 'A' && node.closest('p')),
        )
        .map((node) => {
          const target =
            node instanceof HTMLInputElement && ['checkbox', 'radio'].includes(node.type)
              ? (node.closest('label') ?? node)
              : node;
          const name = (node.getAttribute('aria-label') ?? node.textContent ?? '').trim();
          return {
            name: `${node.tagName.toLowerCase()} ${name}`.slice(0, 60),
            height: target.getBoundingClientRect().height,
          };
        });
    });
    const tagged = (prefix: string) => targets.filter((target) => target.name.startsWith(prefix));
    // Guards against a vacuous pass: the sweep must see the sampled control kinds.
    expect(tagged('a ').length).toBeGreaterThanOrEqual(4);
    expect(tagged('button ').length).toBeGreaterThanOrEqual(2);
    if (screen.name === 'Pases') expect(tagged('select ').length).toBeGreaterThan(0);
    if (screen.name === 'Actividades')
      expect(targets.some((target) => target.name.startsWith('button Todas'))).toBe(true);
    expect(targets.filter((target) => target.height < 44)).toEqual([]);
  });
}
