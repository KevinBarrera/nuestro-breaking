import { Sql } from 'postgres';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

describe('PostgresHarness (e2e)', () => {
  const harness = new PostgresHarness();
  let client: Sql;

  beforeAll(async () => {
    client = await harness.start();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  afterAll(async () => {
    await harness.stop();
  });

  it('applies the users migration and enforces unique emails', async () => {
    const [{ usersTable }] = await client<{ usersTable: string | null }[]>`
      SELECT to_regclass('public.users') AS "usersTable"
    `;

    expect(usersTable).toBe('users');

    await client`
      INSERT INTO users (email, display_name)
      VALUES ('unique@example.com', 'Unique User')
    `;

    await expect(
      client`
        INSERT INTO users (email, display_name)
        VALUES ('unique@example.com', 'Duplicate User')
      `,
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('resets the migrated database and clears test data', async () => {
    await client`
      INSERT INTO users (email, display_name)
      VALUES ('reset@example.com', 'Reset User')
    `;

    const [{ beforeReset }] = await client<{ beforeReset: string }[]>`
      SELECT count(*) AS "beforeReset" FROM users
    `;
    expect(beforeReset).toBe('1');

    await harness.reset();

    const [{ afterReset }] = await client<{ afterReset: string }[]>`
      SELECT count(*) AS "afterReset" FROM users
    `;
    expect(afterReset).toBe('0');
  });
});
