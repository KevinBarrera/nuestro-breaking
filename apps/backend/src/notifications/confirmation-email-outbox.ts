import type { DatabaseService } from '@/database/database.service';
import { registrationConfirmationEmails } from '@/database/schema';

/** A transaction on the application database, as handed to `db.transaction` callbacks. */
export type OutboxTransaction = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0];

/**
 * Queues the confirmation email for a registration inside the caller's transaction (#179 D2), so
 * the row exists exactly when the confirmation commits. The unique `registration_id` makes a
 * repeated call a no-op. Nothing is sent here: after commit, `ConfirmationEmailDispatcher` sends it.
 */
export async function enqueueConfirmationEmail(
  tx: OutboxTransaction,
  registrationId: string,
): Promise<void> {
  await tx
    .insert(registrationConfirmationEmails)
    .values({ registrationId })
    .onConflictDoNothing({ target: registrationConfirmationEmails.registrationId });
}
