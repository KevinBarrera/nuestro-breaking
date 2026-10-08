import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// Unit tests reuse the app's Vite config (plugins and the `@` alias). They cover pure logic
// in Node; browser flows stay in the Playwright specs under `e2e/`.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }),
);
