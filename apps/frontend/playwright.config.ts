import { randomInt } from 'node:crypto';
import { devices, defineConfig } from '@playwright/test';

const live = process.env.NB_LIVE_E2E === '1';
// Live runs use distinct loopback ports; strict Vite binding fails closed on collisions.
const baseURL = live
  ? (process.env.NB_LIVE_ORIGIN ?? `http://127.0.0.1:${randomInt(20000, 40000)}`)
  : 'http://127.0.0.1:4173';
if (live) {
  process.env.NB_LIVE_ORIGIN = baseURL;
  process.env.NB_LIVE_API_PORT ??= String(randomInt(40001, 60000));
}

export default defineConfig({
  testDir: './e2e',
  testMatch: live ? 'live-check-in.spec.ts' : '*.spec.ts',
  testIgnore: live ? [] : ['live-check-in.spec.ts'],
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
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `corepack pnpm exec vite --host 127.0.0.1 --port ${new URL(baseURL).port} --strictPort`,
    url: baseURL,
    env: live ? { VITE_API_BASE_URL: `http://127.0.0.1:${process.env.NB_LIVE_API_PORT}` } : {},
    reuseExistingServer: !live && !process.env.CI,
  },
});
