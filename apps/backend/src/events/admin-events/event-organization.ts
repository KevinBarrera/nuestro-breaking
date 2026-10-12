import { sql } from 'drizzle-orm';
import type { DatabaseService } from '@/database/database.service';
import { organizations } from '@/database/schema';

type Transaction = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0];

/** Name of the organization created with the first event of an empty environment (#213 D1). */
export const DEFAULT_ORGANIZATION_NAME = 'Los más pesados';

/**
 * Serializes the first event creations so two of them cannot each create an organization. Any
 * constant works as long as no other code uses it for a different purpose.
 */
export const EVENT_ORGANIZATION_LOCK_KEY = 213_000_001;

export type EventOrganization =
  { ok: true; organizationId: string } | { ok: false; code: 'organization_ambiguous' };

/**
 * The organization a new event belongs to (#213 D1): the only one, or a new one named
 * `DEFAULT_ORGANIZATION_NAME` when none exists. With more than one there is no choice yet, so the
 * caller refuses the creation. Runs inside the caller's transaction, and the lock is held until it
 * ends, so the event insert is serialized with the organization it may have created.
 */
export async function resolveEventOrganization(tx: Transaction): Promise<EventOrganization> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${sql.raw(String(EVENT_ORGANIZATION_LOCK_KEY))})`,
  );
  const existing = await tx.select({ id: organizations.id }).from(organizations).limit(2);
  if (existing.length > 1) return { ok: false, code: 'organization_ambiguous' };
  if (existing.length === 1) return { ok: true, organizationId: existing[0].id };

  const [created] = await tx
    .insert(organizations)
    .values({ name: DEFAULT_ORGANIZATION_NAME })
    .returning({ id: organizations.id });
  return { ok: true, organizationId: created.id };
}
