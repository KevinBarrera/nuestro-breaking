import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { authSessions } from './auth';
import { users } from './users';

// One-time activation links for administrators (#214 D4, migration 0020). Only the SHA-256 hex
// digest of the token is stored; the token itself is shown once and never persisted.
export const adminInvitations = pgTable(
  'admin_invitations',
  {
    id: uuid('id').defaultRandom().notNull(),
    userId: uuid('user_id').notNull(),
    tokenDigest: text('token_digest').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'admin_invitations_pk' }),
    unique('admin_invitations_token_digest_uq').on(table.tokenDigest),
    // At most one open (neither used nor cancelled) invitation per user.
    uniqueIndex('admin_invitations_open_user_uq')
      .on(table.userId)
      .where(sql`${table.usedAt} IS NULL AND ${table.cancelledAt} IS NULL`),
    check('admin_invitations_token_digest_ck', sql`${table.tokenDigest} ~ '^[a-f0-9]{64}$'`),
    check(
      'admin_invitations_state_ck',
      sql`${table.usedAt} IS NULL OR ${table.cancelledAt} IS NULL`,
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'admin_invitations_user_fk',
    }).onDelete('no action'),
    foreignKey({
      columns: [table.createdByUserId],
      foreignColumns: [users.id],
      name: 'admin_invitations_created_by_fk',
    }).onDelete('no action'),
  ],
);

/** Team actions; the check constraint below allows exactly these. */
export const ADMIN_TEAM_AUDIT_ACTIONS = [
  'invited',
  'invitation_regenerated',
  'invitation_cancelled',
  'activated',
  'scope_changed',
  'deactivated',
  'reactivated',
  'bootstrapped',
] as const;
export type AdminTeamAuditAction = (typeof ADMIN_TEAM_AUDIT_ACTIONS)[number];

// Team audit (#214 D3). Admin actions carry the actor user and session. `bootstrapped` comes from the
// hosted command and has no actor; `activated` is done by the invitee before any session exists, so
// the actor is the target user and there is no session.
export const adminTeamAudit = pgTable(
  'admin_team_audit',
  {
    id: uuid('id').defaultRandom().notNull(),
    action: text('action', { enum: ADMIN_TEAM_AUDIT_ACTIONS }).notNull(),
    actorUserId: uuid('actor_user_id'),
    actorSessionId: uuid('actor_session_id'),
    targetUserId: uuid('target_user_id').notNull(),
    reason: text('reason'),
    details: jsonb('details').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'admin_team_audit_pk' }),
    index('admin_team_audit_target_created_idx').on(table.targetUserId, table.createdAt),
    check(
      'admin_team_audit_action_ck',
      sql`${table.action} IN ('invited', 'invitation_regenerated', 'invitation_cancelled', 'activated', 'scope_changed', 'deactivated', 'reactivated', 'bootstrapped')`,
    ),
    check(
      'admin_team_audit_actor_ck',
      sql`CASE ${table.action} WHEN 'bootstrapped' THEN ${table.actorUserId} IS NULL AND ${table.actorSessionId} IS NULL WHEN 'activated' THEN ${table.actorUserId} IS NOT NULL AND ${table.actorUserId} = ${table.targetUserId} AND ${table.actorSessionId} IS NULL ELSE ${table.actorUserId} IS NOT NULL AND ${table.actorSessionId} IS NOT NULL END`,
    ),
    foreignKey({
      columns: [table.actorUserId],
      foreignColumns: [users.id],
      name: 'admin_team_audit_actor_fk',
    }).onDelete('no action'),
    foreignKey({
      columns: [table.actorSessionId],
      foreignColumns: [authSessions.id],
      name: 'admin_team_audit_session_fk',
    }).onDelete('no action'),
    foreignKey({
      columns: [table.targetUserId],
      foreignColumns: [users.id],
      name: 'admin_team_audit_target_fk',
    }).onDelete('no action'),
  ],
);
