import { defineConfig } from 'drizzle-kit';
import { getDatabaseUrl } from './src/database/environment';

export default defineConfig({
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: getDatabaseUrl(),
  },
});
