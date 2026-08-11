import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { register } from 'tsconfig-paths';

register({ baseUrl: resolve(__dirname, '..'), paths: { '@/*': ['src/*'] } });
const requireFromScript = createRequire(__filename);

async function main(): Promise<void> {
  const { getDatabaseUrl } = requireFromScript(
    '@/database/environment',
  ) as typeof import('@/database/environment');
  const { seedLocalDatabase } = requireFromScript(
    '@/modules/event-organization/infrastructure/local-seed',
  ) as typeof import('@/modules/event-organization/infrastructure/local-seed');
  const { assertLocalSeedEnvironment } = requireFromScript(
    '@/modules/event-organization/infrastructure/local-seed-policy',
  ) as typeof import('@/modules/event-organization/infrastructure/local-seed-policy');
  const databaseUrl = getDatabaseUrl();
  assertLocalSeedEnvironment(process.env, databaseUrl);
  const client = postgres(databaseUrl);

  try {
    await seedLocalDatabase(client);
  } finally {
    await client.end({ timeout: 5 });
  }
}

if (require.main === module) {
  void main();
}
