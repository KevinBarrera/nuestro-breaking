import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { eventRegistrations } from './registrations';

// Legal documents a buyer accepts before paying (#180, migration 0026). The check constraint below
// allows exactly these keys.
export const LEGAL_DOCUMENT_KEY_VALUES = ['rules', 'privacy', 'cancellation'] as const;

// Append-only record of each acceptance: the document key, the version the buyer saw and when. A
// reused pending registration gets new rows; earlier rows are never updated, so a later version
// change leaves them as they were.
export const registrationLegalAcceptances = pgTable(
  'registration_legal_acceptances',
  {
    id: uuid('id').defaultRandom().notNull(),
    registrationId: uuid('registration_id').notNull(),
    documentKey: text('document_key', { enum: LEGAL_DOCUMENT_KEY_VALUES }).notNull(),
    documentVersion: text('document_version').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'registration_legal_acceptances_pk' }),
    index('registration_legal_acceptances_registration_idx').on(table.registrationId),
    check(
      'registration_legal_acceptances_document_key_ck',
      sql`${table.documentKey} IN ('rules', 'privacy', 'cancellation')`,
    ),
    check(
      'registration_legal_acceptances_document_version_ck',
      sql`length(${table.documentVersion}) BETWEEN 1 AND 64`,
    ),
    foreignKey({
      columns: [table.registrationId],
      foreignColumns: [eventRegistrations.id],
      name: 'registration_legal_acceptances_registration_fk',
    }).onDelete('no action'),
  ],
);
