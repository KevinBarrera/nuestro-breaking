import { DatabaseService } from '@/database/database.service';
import {
  BOOTSTRAP_EXIT_CODES,
  bootstrapAdmin,
  parseAdminBootstrapInput,
  type AdminBootstrapOutcome,
} from '@/identity-access/admin-bootstrap';

// Hosted first-admin bootstrap (#214). See docs/runbooks/admin-bootstrap.md.
async function main(): Promise<void> {
  let input;
  try {
    input = parseAdminBootstrapInput(process.env);
  } catch (error) {
    if (error instanceof Error) process.stderr.write(`${error.message}\n`);
    process.exitCode = BOOTSTRAP_EXIT_CODES.error;
    return;
  }
  const database = new DatabaseService();
  try {
    const outcome = await bootstrapAdmin(database.db, input);
    report(outcome);
  } finally {
    await database.onModuleDestroy();
  }
}

function report(outcome: AdminBootstrapOutcome): void {
  if (outcome.kind === 'refused') {
    process.stderr.write(
      outcome.reason === 'active_admin_exists'
        ? 'Refused: an active global administrator already exists; manage the team from the admin panel.\n'
        : `Refused: a pending global administrator (${outcome.maskedEmail}) has not activated their account yet. Run again with that email to issue a new link.\n`,
    );
    process.exitCode = BOOTSTRAP_EXIT_CODES.refused;
    return;
  }
  process.stdout.write(
    [
      outcome.reissued
        ? 'A new activation link was issued; the previous link no longer works.'
        : 'First global administrator created.',
      `Activation link: ${outcome.link}`,
      `Expires at: ${outcome.expiresAt.toISOString()}`,
      'This link is shown only once. Share it privately with the administrator.',
      '',
    ].join('\n'),
  );
}

void main().catch(() => {
  // Never print driver errors: they can include a URL, credentials, or SQL bindings.
  process.stderr.write('Admin bootstrap failed. Check database availability and try again.\n');
  process.exitCode = BOOTSTRAP_EXIT_CODES.error;
});
