import { drizzle } from 'drizzle-orm/postgres-js';
import { type Sql } from 'postgres';
import * as schema from '@/database/schema';
import {
  bootstrapAdmin,
  INVITATION_TTL_MS,
  type AdminBootstrapInput,
  type BootstrapDatabase,
} from '@/identity-access/admin-bootstrap';
import { hashPassword } from '@/identity-access/password-policy';
import { digest } from '@/identity-access/session-access.service';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

const input: AdminBootstrapInput = {
  email: 'first.admin@example.com',
  displayName: 'First Admin',
  origin: 'https://admin.example.com',
};
const now = new Date('2026-10-11T12:00:00.000Z');

// Hosted first-admin bootstrap (#214 T2): one global admin with a one-time activation link, and
// only while no activated global admin exists.
describe('admin bootstrap (e2e)', () => {
  const harness = new PostgresHarness();
  let client: Sql;
  let db: BootstrapDatabase;

  beforeAll(async () => {
    client = await harness.start();
    db = drizzle({ client, schema });
  });
  beforeEach(async () => harness.reset());
  afterAll(async () => harness.stop());

  async function snapshot() {
    const usersRows = await client`
      SELECT email, display_name, active, password_hash FROM users ORDER BY email`;
    const roles = await client`
      SELECT u.email, r.role, r.scope_type, r.scope_id, r.active
      FROM user_roles r JOIN users u ON u.id = r.user_id ORDER BY u.email`;
    // This raw client returns timestamps as text; compare them as instants.
    const invitations = (
      await client<
        { email: string; token_digest: string; expires_at: string; cancelled_at: string | null }[]
      >`
      SELECT u.email, i.token_digest, i.expires_at, i.cancelled_at, i.created_by_user_id = i.user_id AS self_created
      FROM admin_invitations i JOIN users u ON u.id = i.user_id ORDER BY i.created_at, i.id`
    ).map((row) => ({
      ...row,
      expires_at: new Date(row.expires_at),
      cancelled_at: row.cancelled_at === null ? null : new Date(row.cancelled_at),
    }));
    const audit = await client`
      SELECT a.action, a.actor_user_id, a.actor_session_id, u.email, a.details
      FROM admin_team_audit a JOIN users u ON u.id = a.target_user_id ORDER BY a.created_at, a.id`;
    return { users: usersRows, roles, invitations, audit };
  }

  function tokenOf(link: string) {
    const prefix = `${input.origin}/activar-cuenta#`;
    expect(link.startsWith(prefix)).toBe(true);
    return link.slice(prefix.length);
  }

  async function activate(email: string) {
    await client`UPDATE users SET password_hash = ${await hashPassword('SufficientlyStrong1!')}
      WHERE email = ${email}`;
  }

  it('creates one global admin, one open invitation, and one bootstrapped audit on a fresh database', async () => {
    const outcome = await bootstrapAdmin(db, input, now);

    if (outcome.kind !== 'issued') throw new Error('expected a link');
    expect(outcome.reissued).toBe(false);
    expect(outcome.link).toMatch(/^https:\/\/admin\.example\.com\/activar-cuenta#[a-f0-9]{64}$/);
    expect(outcome.expiresAt).toEqual(new Date(now.getTime() + INVITATION_TTL_MS));
    const state = await snapshot();
    expect(state.users).toEqual([
      {
        email: input.email,
        display_name: 'First Admin',
        active: true,
        password_hash: null,
      },
    ]);
    expect(state.roles).toEqual([
      { email: input.email, role: 'admin', scope_type: 'global', scope_id: null, active: true },
    ]);
    expect(state.invitations).toEqual([
      expect.objectContaining({
        email: input.email,
        cancelled_at: null,
        expires_at: new Date('2026-10-14T12:00:00.000Z'),
        self_created: true,
      }),
    ]);
    expect(state.audit).toEqual([
      {
        action: 'bootstrapped',
        actor_user_id: null,
        actor_session_id: null,
        email: input.email,
        details: { scope: 'global' },
      },
    ]);
  });

  it('stores only the digest of the printed token', async () => {
    const outcome = await bootstrapAdmin(db, input, now);
    if (outcome.kind !== 'issued') throw new Error('expected a link');
    const token = tokenOf(outcome.link);

    const [{ token_digest: stored }] = (await snapshot()).invitations;
    expect(stored).not.toBe(token);
    expect(stored).toBe(digest(token));
  });

  it('refuses and changes nothing once a global admin has activated', async () => {
    await bootstrapAdmin(db, input, now);
    await activate(input.email);
    const before = await snapshot();

    await expect(
      bootstrapAdmin(db, { ...input, email: 'someone.else@example.com' }, now),
    ).resolves.toEqual({ kind: 'refused', reason: 'active_admin_exists' });
    await expect(bootstrapAdmin(db, input, now)).resolves.toEqual({
      kind: 'refused',
      reason: 'active_admin_exists',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('rotates the invitation when run again with the same pending email', async () => {
    const first = await bootstrapAdmin(db, input, now);
    const later = new Date(now.getTime() + 4 * INVITATION_TTL_MS);
    const second = await bootstrapAdmin(db, { ...input, displayName: 'Renamed Admin' }, later);
    if (first.kind !== 'issued' || second.kind !== 'issued') throw new Error('expected links');

    expect(second.reissued).toBe(true);
    expect(tokenOf(second.link)).not.toBe(tokenOf(first.link));
    const state = await snapshot();
    expect(state.roles).toHaveLength(1);
    expect(state.users).toEqual([expect.objectContaining({ display_name: 'Renamed Admin' })]);
    expect(state.invitations).toEqual([
      expect.objectContaining({
        token_digest: digest(tokenOf(first.link)),
        cancelled_at: later,
      }),
      expect.objectContaining({ token_digest: digest(tokenOf(second.link)), cancelled_at: null }),
    ]);
    expect(state.audit.map((row) => row.details as unknown)).toEqual([
      { scope: 'global' },
      { scope: 'global', reissued: true },
    ]);
  });

  it('refuses a different email while a pending bootstrap admin exists, masking theirs', async () => {
    await bootstrapAdmin(db, input, now);
    const before = await snapshot();

    await expect(
      bootstrapAdmin(db, { ...input, email: 'other.person@example.com' }, now),
    ).resolves.toEqual({
      kind: 'refused',
      reason: 'pending_admin_exists',
      maskedEmail: 'f***@example.com',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('reuses an existing user row by email, clearing its password and open sessions', async () => {
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO users (email, display_name, active, password_hash)
      VALUES (${input.email}, 'Old Name', false, ${await hashPassword('SufficientlyStrong1!')})
      RETURNING id`;
    await client`INSERT INTO user_roles (user_id, role, scope_type, scope_id)
      VALUES (${id}, 'admin', 'event', gen_random_uuid())`;
    await client`INSERT INTO auth_sessions (user_id, token_digest, expires_at)
      VALUES (${id}, ${digest('session')}, ${new Date(now.getTime() + 60_000).toISOString()})`;

    await expect(bootstrapAdmin(db, input, now)).resolves.toMatchObject({ kind: 'issued' });

    const state = await snapshot();
    expect(state.users).toEqual([
      { email: input.email, display_name: 'First Admin', active: true, password_hash: null },
    ]);
    expect(state.roles).toContainEqual(
      expect.objectContaining({ scope_type: 'global', active: true }),
    );
    const [{ revoked }] = await client<{ revoked: boolean }[]>`
      SELECT revoked_at IS NOT NULL AS revoked FROM auth_sessions WHERE user_id = ${id}`;
    expect(revoked).toBe(true);
  });

  it('keeps the single global admin role of a deactivated admin it reactivates', async () => {
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO users (email, display_name, active, password_hash)
      VALUES (${input.email}, 'Old Name', false, ${await hashPassword('SufficientlyStrong1!')})
      RETURNING id`;
    await client`INSERT INTO user_roles (user_id, role, scope_type, scope_id)
      VALUES (${id}, 'admin', 'global', NULL)`;

    await expect(bootstrapAdmin(db, input, now)).resolves.toMatchObject({ kind: 'issued' });

    const state = await snapshot();
    expect(state.users).toEqual([
      { email: input.email, display_name: 'First Admin', active: true, password_hash: null },
    ]);
    expect(state.roles).toEqual([
      { email: input.email, role: 'admin', scope_type: 'global', scope_id: null, active: true },
    ]);
    expect(state.invitations.filter((row) => row.cancelled_at === null)).toHaveLength(1);
  });

  it('lets only one of two concurrent runs create the admin', async () => {
    const outcomes = await Promise.all([
      bootstrapAdmin(db, input, now),
      bootstrapAdmin(db, { ...input, email: 'second@example.com' }, now),
    ]);

    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(['issued', 'refused']);
    expect((await snapshot()).roles).toHaveLength(1);
  });
});
