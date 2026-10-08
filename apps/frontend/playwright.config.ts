import { randomInt } from 'node:crypto';
import { devices, defineConfig } from '@playwright/test';

const live = process.env.NB_LIVE_E2E === '1';
// Live runs use distinct loopback ports; strict Vite binding fails closed on collisions.
const baseURL = live
  ? (process.env.NB_LIVE_ORIGIN ?? `http://127.0.0.1:${randomInt(20000, 40000)}`)
  : 'http://127.0.0.1:4173';
// CI serves a production build instead of the on-demand Vite dev server, which is
// slow on small runners. Live runs keep the dev server and its API proxy settings.
const preview = !live && process.env.NB_E2E_PREVIEW === '1';
// Pull requests skip the theme × screen sweeps; every push to dev runs them.
// Feature specs keep their own phone-width checks, so PRs still cover narrow layouts.
const skipSweeps = !live && process.env.NB_E2E_SKIP_SWEEPS === '1';
const sweeps = ['admin-accessibility.spec.ts', 'admin-phone-width.spec.ts'];
const port = new URL(baseURL).port;
if (live) {
  process.env.NB_LIVE_ORIGIN = baseURL;
  process.env.NB_LIVE_API_PORT ??= String(randomInt(40001, 60000));
}

export default defineConfig({
  testDir: './e2e',
  testMatch: live ? 'live-check-in.spec.ts' : '*.spec.ts',
  testIgnore: live ? [] : ['live-check-in.spec.ts', ...(skipSweeps ? sweeps : [])],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Keeps every spec offline-deterministic: font hosts fail DNS instantly instead of
        // reaching the network. Fonts load non-blocking, so pages render with fallbacks.
        launchOptions: {
          args: [
            '--host-resolver-rules=MAP fonts.googleapis.com ~NOTFOUND, MAP fonts.gstatic.com ~NOTFOUND',
          ],
        },
      },
    },
  ],
  webServer: {
    command: preview
      ? `corepack pnpm exec vite build && corepack pnpm exec vite preview --host 127.0.0.1 --port ${port} --strictPort`
      : `corepack pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    // Preview mode builds before serving, so allow more time than the 60s default.
    timeout: preview ? 120_000 : 60_000,
    env: live ? { VITE_API_BASE_URL: `http://127.0.0.1:${process.env.NB_LIVE_API_PORT}` } : {},
    reuseExistingServer: !live && !process.env.CI,
  },
});
