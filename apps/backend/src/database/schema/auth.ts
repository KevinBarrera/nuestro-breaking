import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role').notNull(),
    scopeType: text('scope_type').notNull().default('global'),
    scopeId: uuid('scope_id'),
    active: boolean('active').notNull().default(true),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    check('user_roles_role_ck', sql`${table.role} IN ('admin', 'judge', 'dancer')`),
    check('user_roles_scope_ck', sql`${table.scopeType} IN ('global', 'organization', 'event')`),
    check(
      'user_roles_lifecycle_ck',
      sql`(${table.active} = true AND ${table.revokedAt} IS NULL) OR (${table.active} = false)`,
    ),
  ],
);

export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  tokenDigest: text('token_digest').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export const authAudit = pgTable(
  'auth_audit',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    action: text('action').notNull(),
    userId: uuid('user_id').references(() => users.id),
    sessionId: uuid('session_id').references(() => authSessions.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'auth_audit_action_ck',
      sql`${table.action} IN ('session_created', 'denied', 'session_revoked')`,
    ),
  ],
);
