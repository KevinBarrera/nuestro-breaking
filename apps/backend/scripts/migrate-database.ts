import { getDatabaseUrl } from '@/database/environment';
import { applyMigrations, findMigrationsFolder } from '@/database/migrations';

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
  // Report the PostgreSQL error code and message only: never the connection URL or the error object.
  const code =
    typeof error === 'object' && error && 'code' in error ? ` [${String(error.code)}]` : '';
  const message = error instanceof Error ? error.message : 'unknown error';
  process.stderr.write(`Database migration failed${code}: ${message}\n`);
  process.exitCode = 1;
});
