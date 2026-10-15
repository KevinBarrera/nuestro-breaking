import { getDatabaseUrl } from '@/database/environment';
import {
  applyMigrations,
  describeMigrationError,
  findMigrationsFolder,
} from '@/database/migrations';

// Deploy-time migration command (#238): runs with plain `node` from `dist`, no devDependencies.
// See docs/runbooks/deploy.md.
async function main(): Promise<void> {
  const { applied, total } = await applyMigrations(
    getDatabaseUrl(),
    findMigrationsFolder(__dirname),
  );
  process.stdout.write(
    applied === 0
      ? `Database is up to date (${total} migrations).\n`
      : `Applied ${applied} migration(s); ${total} in total.\n`,
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(`Database migration failed: ${describeMigrationError(error)}\n`);
  process.exitCode = 1;
});
