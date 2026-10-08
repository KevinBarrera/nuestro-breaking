import { expect, test, type Page } from '@playwright/test';
import {
  adminDialogs,
  adminScreen,
  adminScreens,
  mockAdminApi,
  revealControls,
  themes,
  useTheme,
} from './support/admin-mocks.ts';
import { selectTrigger } from './support/select.ts';

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
  ['chip-selected-fg', 'chip-selected-bg'],
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
// through their wrapping label, which is the real hit area. React Aria's aria-hidden native
// select (kept for autofill) is not a target; its visible trigger button is.
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
            node.getClientRects().length > 0 &&
            !node.closest('[aria-hidden="true"]') &&
            !(node.tagName === 'A' && node.closest('p')),
        )
        .map((node) => {
          const target =
            node instanceof HTMLInputElement && ['checkbox', 'radio'].includes(node.type)
              ? (node.closest('label') ?? node)
              : node;
          const name = (node.getAttribute('aria-label') ?? node.textContent ?? '').trim();
          const tag = node.getAttribute('aria-haspopup') === 'listbox' ? 'select' : node.tagName;
          return {
            name: `${tag.toLowerCase()} ${name}`.slice(0, 60),
            height: target.getBoundingClientRect().height,
          };
        });
    });
    const tagged = (prefix: string) => targets.filter((target) => target.name.startsWith(prefix));
    // Guards against a vacuous pass: the sweep must see the sampled control kinds.
    expect(tagged('a ').length).toBeGreaterThanOrEqual(4);
    expect(tagged('button ').length).toBeGreaterThanOrEqual(2);
    // Every event screen has the topbar event select; a pass screen adds one per access row.
    const accessRows = screen.name === 'Pase' || screen.name === 'Nuevo pase';
    expect(tagged('select ').length).toBeGreaterThanOrEqual(accessRows ? 2 : 1);
    if (screen.name === 'Actividades')
      expect(targets.some((target) => target.name.startsWith('button Todas'))).toBe(true);
    expect(targets.filter((target) => target.height < 44)).toEqual([]);
  });
}

// The open listbox renders in a popover outside the shell, so it gets its own sweep: options
// keep 44px targets and every option text keeps 4.5:1 on its painted background, including
// the focused and selected option, in both themes and in both the header and an access-list row.
const popoverCases = [
  { name: 'topbar event selector', screen: adminScreens[0], trigger: 'Evento' },
  {
    name: 'access list row',
    screen: adminScreen('Pase'),
    trigger: 'Acceso a Taller de footwork',
  },
] as const;

for (const theme of themes) {
  for (const { name, screen, trigger } of popoverCases) {
    test(`${theme} theme ${name} listbox keeps 44px options and 4.5:1 text`, async ({ page }) => {
      await useTheme(page, theme);
      await mockAdminApi(page);
      await page.goto(screen.path);
      await revealControls(page, screen.name);
      await selectTrigger(page, trigger).focus();
      await page.keyboard.press('ArrowDown');
      const listbox = page.getByRole('listbox');
      await expect(listbox).toBeVisible();
      // Opening moves focus to the selected option, so the focused style is measured too.
      await expect(listbox.getByRole('option', { selected: true })).toBeFocused();
      const options = await listbox.getByRole('option').evaluateAll((nodes) =>
        nodes.map((node) => {
          let painted: Element | null = node;
          let bg = 'rgba(0, 0, 0, 0)';
          while (painted && /rgba\(.*, 0\)$/.test(bg)) {
            bg = getComputedStyle(painted).backgroundColor;
            painted = painted.parentElement;
          }
          return {
            name: node.textContent ?? '',
            selected: node.getAttribute('aria-selected') === 'true',
            height: node.getBoundingClientRect().height,
            fg: getComputedStyle(node).color,
            bg,
          };
        }),
      );
      expect(options.length).toBeGreaterThanOrEqual(1);
      expect(options.filter((option) => option.selected)).toHaveLength(1);
      const rgba = (value: string) =>
        [...value.match(/[\d.]+/g)!.map(Number), 1].slice(0, 4) as Rgba;
      for (const option of options) {
        expect(option.height, option.name).toBeGreaterThanOrEqual(44);
        expect(rgba(option.bg)[3], `${option.name} background must be opaque`).toBe(1);
        expect(
          contrast(rgba(option.fg), rgba(option.bg)),
          `${option.name} text contrast`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
}

// Filter chips: the selected chip must read as selected by lightness, not hue alone, so its
// painted background has to stand clearly apart from an unselected chip's in both themes,
// and both chip states keep 4.5:1 text.
for (const theme of themes) {
  test(`${theme} theme selected filter chip differs in lightness and keeps contrast`, async ({
    page,
  }) => {
    await useTheme(page, theme);
    await mockAdminApi(page);
    await page.goto(adminScreens[2].path);
    const group = page.getByRole('group', { name: 'Filtrar por tipo' });
    const selected = group.locator('button[aria-pressed="true"]');
    const unselected = group.locator('button[aria-pressed="false"]').first();
    await expect(selected).toHaveCount(1);
    await expect(unselected).toBeVisible();
    // The selected state also shows a check icon, so it is not conveyed by color alone.
    await expect(selected.locator('svg[aria-hidden="true"]')).toHaveCount(1);
    await expect(unselected.locator('svg')).toHaveCount(0);
    const paint = (node: Element) => {
      let painted: Element | null = node;
      let bg = 'rgba(0, 0, 0, 0)';
      while (painted && /rgba\(.*, 0\)$/.test(bg)) {
        bg = getComputedStyle(painted).backgroundColor;
        painted = painted.parentElement;
      }
      return { fg: getComputedStyle(node).color, bg };
    };
    const rgba = (value: string) => [...value.match(/[\d.]+/g)!.map(Number), 1].slice(0, 4) as Rgba;
    const on = await selected.evaluate(paint);
    const off = await unselected.evaluate(paint);
    for (const [label, state] of [
      ['selected', on],
      ['unselected', off],
    ] as const) {
      expect(rgba(state.bg)[3], `${label} chip background must be opaque`).toBe(1);
      expect(contrast(rgba(state.fg), rgba(state.bg)), `${label} chip text`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
    // 3:1 between the two backgrounds is a clear lightness step (WCAG non-text contrast).
    expect(
      contrast(rgba(on.bg), rgba(off.bg)),
      'selected vs unselected chip background',
    ).toBeGreaterThanOrEqual(3);
  });
}

// Dialogs render in an overlay at the end of <body>, so they get their own sweep in both
// themes: every control inside keeps a 44px target, and every text, including the filled
// `destructive` confirm button, keeps 4.5:1 against the background it is painted on.
for (const theme of themes) {
  for (const dialog of adminDialogs) {
    test(`${theme} theme ${dialog.name} dialog keeps 44px targets and 4.5:1 text`, async ({
      page,
    }) => {
      await useTheme(page, theme);
      await mockAdminApi(page);
      await page.goto(adminScreen(dialog.screen).path);
      await revealControls(page, dialog.screen);
      const open = await dialog.open(page);
      await expect(open).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const report = await open.evaluate((root) => {
        const painted = (node: Element) => {
          let current: Element | null = node;
          let bg = 'rgba(0, 0, 0, 0)';
          while (current && /rgba\(.*, 0\)$/.test(bg)) {
            bg = getComputedStyle(current).backgroundColor;
            current = current.parentElement;
          }
          return bg;
        };
        const controls = [
          ...root.querySelectorAll<HTMLElement>(
            'a[href], button, input, textarea, [role="button"]',
          ),
        ]
          .filter(
            (node) => node.getClientRects().length > 0 && !node.closest('[aria-hidden="true"]'),
          )
          .map((node) => {
            const target =
              node instanceof HTMLInputElement && ['checkbox', 'radio'].includes(node.type)
                ? (node.closest('label') ?? node)
                : node;
            return {
              name: (node.getAttribute('aria-label') ?? node.textContent ?? node.tagName).trim(),
              height: target.getBoundingClientRect().height,
            };
          });
        const texts = [...root.querySelectorAll<HTMLElement>('*')]
          .filter(
            (node) =>
              node.getClientRects().length > 0 &&
              !node.closest('[aria-hidden="true"]') &&
              !node.classList.contains('sr-only') &&
              [...node.childNodes].some(
                (child) => child.nodeType === Node.TEXT_NODE && child.textContent!.trim(),
              ),
          )
          .map((node) => ({
            text: node.textContent.trim().slice(0, 40),
            fg: getComputedStyle(node).color,
            bg: painted(node),
          }));
        return { controls, texts };
      });
      expect(report.controls.length).toBeGreaterThanOrEqual(2);
      expect(report.controls.filter((control) => control.height < 44)).toEqual([]);
      const rgba = (value: string) =>
        [...value.match(/[\d.]+/g)!.map(Number), 1].slice(0, 4) as Rgba;
      expect(report.texts.length).toBeGreaterThanOrEqual(3);
      const failures = report.texts
        .filter(
          (entry) => rgba(entry.bg)[3] !== 1 || contrast(rgba(entry.fg), rgba(entry.bg)) < 4.5,
        )
        .map((entry) => `${entry.text}: ${contrast(rgba(entry.fg), rgba(entry.bg)).toFixed(2)}`);
      expect(failures).toEqual([]);
    });
  }
}
