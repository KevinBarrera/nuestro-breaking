import { verify } from 'argon2';
import { users, userRoles } from '@/database/schema';
import {
  parseLocalAdminInput,
  provisionLocalAdmin,
  type ProvisioningDatabase,
} from './local-admin-provisioning';

const confirmation = '--confirm-local-only=provision-local-admin';
const args = [confirmation, '--email=admin@example.test', '--display-name=Local Admin'];
const env = {
  LOCAL_ADMIN_PROVISIONING: 'I_UNDERSTAND_THIS_IS_LOCAL_ONLY',
  LOCAL_ADMIN_PASSWORD: 'SufficientlyStrong1!',
  DATABASE_URL: 'postgresql://user:secret@localhost:5432/nuestro_local',
};

describe('local admin provisioning', () => {
  it.each([
    ['missing opt-in', { ...env, LOCAL_ADMIN_PROVISIONING: undefined }, args],
    ['incorrect opt-in', { ...env, LOCAL_ADMIN_PROVISIONING: 'true' }, args],
    ['missing confirmation', env, args.slice(1)],
    ['wrong confirmation', env, ['--confirm-local-only=yes', ...args.slice(1)]],
    ['production NODE_ENV', { ...env, NODE_ENV: 'production' }, args],
    ['staging APP_ENV', { ...env, APP_ENV: 'staging' }, args],
    ['preview VERCEL_ENV', { ...env, VERCEL_ENV: 'preview' }, args],
    ['railway environment', { ...env, RAILWAY_ENVIRONMENT: 'production' }, args],
    ['vercel host', { ...env, VERCEL: '1' }, args],
    ['render host', { ...env, RENDER: 'true' }, args],
    ['fly host', { ...env, FLY_APP_NAME: 'app' }, args],
    ['cloud run', { ...env, K_SERVICE: 'app' }, args],
    ['CI', { ...env, CI: 'true' }, args],
    ['github actions', { ...env, GITHUB_ACTIONS: 'true' }, args],
    ['remote host', { ...env, DATABASE_URL: 'postgres://u:p@db.example.test/app_local' }, args],
    [
      'lookalike host',
      { ...env, DATABASE_URL: 'postgres://u:p@localhost.example.test/app_local' },
      args,
    ],
    ['non-local database', { ...env, DATABASE_URL: 'postgres://u:p@localhost/production' }, args],
    [
      'production-like local database',
      { ...env, DATABASE_URL: 'postgres://u:p@localhost/production_local' },
      args,
    ],
    [
      'numbered production-like local database',
      { ...env, DATABASE_URL: 'postgres://u:p@localhost/production2025_local' },
      args,
    ],
    [
      'database URL host override',
      { ...env, DATABASE_URL: 'postgres://u:p@localhost/app_local?host=db.example.test' },
      args,
    ],
    ['missing password', { ...env, LOCAL_ADMIN_PASSWORD: undefined }, args],
    ['weak password', { ...env, LOCAL_ADMIN_PASSWORD: 'password' }, args],
    ['invalid email', env, [confirmation, '--email=not-an-email', '--display-name=Local Admin']],
    [
      'control-character email',
      env,
      [confirmation, '--email=admin\u0000@example.test', '--display-name=Local Admin'],
    ],
    [
      'trailing-control-character email',
      env,
      [confirmation, '--email=admin@example.test\n', '--display-name=Local Admin'],
    ],
    [
      'control-character display name',
      env,
      [confirmation, '--email=admin@example.test', '--display-name=Local Admin\n'],
    ],
    ['empty display name', env, [confirmation, '--email=admin@example.test', '--display-name=  ']],
    ['duplicate flag', env, [...args, '--email=another@example.test']],
  ])('rejects %s before provisioning', (_label, environment, arguments_) => {
    expect(() => parseLocalAdminInput(arguments_, environment)).toThrow();
  });

  it.each(['localhost', '127.0.0.1', '[::1]'])('accepts %s with a local database', (host) => {
    expect(
      parseLocalAdminInput(args, {
        ...env,
        DATABASE_URL: `postgresql://u:p@${host}:5432/nuestro_dev`,
      }).email,
    ).toBe('admin@example.test');
  });

  it('upserts a user and creates one active global admin role, without exposing the hash', async () => {
    const roles: { id: string; active: boolean; revokedAt: Date | null }[] = [];
    const insertedUsers: { passwordHash: string; active: boolean; displayName: string }[] = [];
    const tx = {
      insert: jest.fn((table: unknown) => ({
        values: jest.fn((values: Record<string, unknown>) => {
          if (table === users) insertedUsers.push(values as (typeof insertedUsers)[number]);
          if (table === userRoles) roles.push({ id: 'role-1', active: true, revokedAt: null });
          return {
            onConflictDoUpdate: () => ({ returning: () => Promise.resolve([{ id: 'user-1' }]) }),
          };
        }),
      })),
      select: jest.fn(() => ({ from: () => ({ where: () => Promise.resolve(roles) }) })),
      update: jest.fn(() => ({ set: () => ({ where: () => Promise.resolve([]) }) })),
    };
    const database = {
      transaction: async (fn: (transaction: typeof tx) => Promise<void>) => fn(tx),
    };
    const input = parseLocalAdminInput(args, env);
    await provisionLocalAdmin(database as unknown as ProvisioningDatabase, input);
    await provisionLocalAdmin(database as unknown as ProvisioningDatabase, input);
    expect(insertedUsers).toHaveLength(2);
    expect(insertedUsers[0]).toMatchObject({ active: true, displayName: 'Local Admin' });
    expect(insertedUsers[0].passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verify(insertedUsers[0].passwordHash, env.LOCAL_ADMIN_PASSWORD)).toBe(true);
    expect(roles).toHaveLength(1);
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).toHaveBeenCalledTimes(3);
  });

  it('collapses duplicate active global admin roles to exactly one', async () => {
    const roles = [{ id: 'first' }, { id: 'second' }];
    const set = jest.fn((value: { active: boolean; revokedAt: Date }) => {
      void value;
      return { where: () => Promise.resolve([]) };
    });
    const tx = {
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: () => ({ returning: () => Promise.resolve([{ id: 'user-1' }]) }),
        }),
      }),
      select: () => ({ from: () => ({ where: () => Promise.resolve(roles) }) }),
      update: () => ({ set }),
    };
    await provisionLocalAdmin(
      {
        transaction: async (fn: (transaction: typeof tx) => Promise<void>) => fn(tx),
      } as unknown as ProvisioningDatabase,
      parseLocalAdminInput(args, env),
    );
    expect(set.mock.calls[0][0].active).toBe(false);
    expect(set.mock.calls[0][0].revokedAt).toBeInstanceOf(Date);
  });
});
