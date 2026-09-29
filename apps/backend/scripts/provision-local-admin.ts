import { DatabaseService } from '@/database/database.service';
import { getDatabaseUrl } from '@/database/environment';
import {
  parseLocalAdminInput,
  provisionLocalAdmin,
} from '@/identity-access/local-admin-provisioning';

async function main(): Promise<void> {
  let input;
  try {
    input = parseLocalAdminInput(process.argv.slice(2), process.env, getDatabaseUrl());
  } catch (error) {
    if (error instanceof Error) process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  const database = new DatabaseService();
  try {
    await provisionLocalAdmin(database.db, input);
    process.stdout.write('Local admin provisioned.\n');
  } finally {
    await database.onModuleDestroy();
  }
}

void main().catch(() => {
  // Never print driver errors: they can include a URL, credentials, or SQL bindings.
  process.stderr.write(
    'Local admin provisioning failed. Check local database availability and input.\n',
  );
  process.exitCode = 1;
});
