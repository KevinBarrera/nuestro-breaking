import { DatabaseService } from '@/database/database.service';
import { getDatabaseUrl } from '@/database/environment';
import {
  parseNovemberCatalogSeedInput,
  seedNovemberCatalog,
  type SeedSummary,
} from '@/events/catalog-seed';

async function main(): Promise<void> {
  try {
    parseNovemberCatalogSeedInput(process.argv.slice(2), process.env, getDatabaseUrl());
  } catch (error) {
    if (error instanceof Error) process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  const database = new DatabaseService();
  try {
    const summary = await seedNovemberCatalog(database.db);
    process.stdout.write(formatSummary(summary));
  } finally {
    await database.onModuleDestroy();
  }
}

function formatSummary(summary: SeedSummary): string {
  const lines = (Object.keys(summary.created) as (keyof SeedSummary['created'])[]).map(
    (entity) =>
      `  ${entity}: ${summary.created[entity]} created, ${summary.existing[entity]} existing`,
  );
  return [
    'November catalog seed complete (existing records were left unchanged).',
    ...lines,
    '',
  ].join('\n');
}

void main().catch(() => {
  // Never print driver errors: they can include a URL, credentials, or SQL bindings.
  process.stderr.write(
    'November catalog seed failed. Check local database availability and migrations.\n',
  );
  process.exitCode = 1;
});
