import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { assertHostedBuildEnv } from './src/shared/config/hosted-build-env.ts';

// Fails a Cloudflare build early when its build variables would ship a broken site.
function hostedBuildEnvGuard(): Plugin {
  return {
    name: 'hosted-build-env-guard',
    apply: 'build',
    configResolved(config) {
      assertHostedBuildEnv({ WORKERS_CI: process.env.WORKERS_CI, ...config.env });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), hostedBuildEnvGuard()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
