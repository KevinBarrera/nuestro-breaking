import { GoneException } from '@nestjs/common';
import type { DatabaseService } from '@/database/database.service';
import { users } from '@/database/schema';
import { AccountActivationService } from './account-activation.service';
import { hashPassword } from './password-policy';

jest.mock('./password-policy', () => ({ hashPassword: jest.fn() }));

const token = 'a'.repeat(64);

/** A database double whose unlocked invitation lookup finds nothing. */
function databaseWithoutInvitation() {
  const where = jest.fn().mockResolvedValue([]);
  const transaction = jest.fn();
  const db = {
    select: () => ({ from: () => ({ innerJoin: () => ({ where }) }) }),
    transaction,
  } as unknown as DatabaseService['db'];
  return { db, transaction };
}

/**
 * A database double whose unlocked lookup finds a usable link and whose locked re-read of the
 * invitation would still find it, but whose locked re-read of the user finds nothing: only the
 * user was deactivated between the read and the lock.
 */
function databaseWithUserDeactivatedBeforeLock() {
  const update = jest.fn();
  const insert = jest.fn();
  const lockedTables: unknown[] = [];
  const locked = (table: unknown, rows: unknown[]) => ({
    for: () => {
      lockedTables.push(table);
      return Promise.resolve(rows);
    },
  });
  const tx = {
    select: () => ({
      from: (table: unknown) =>
        table === users
          ? { where: () => locked(table, []) }
          : { innerJoin: () => ({ where: () => locked(table, [{ id: 'invitation-1' }]) }) },
    }),
    update,
    insert,
  };
  const db = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: jest.fn().mockResolvedValue([
            {
              userId: 'user-1',
              displayName: 'Ana',
              email: 'ana@example.test',
              expiresAt: new Date(),
            },
          ]),
        }),
      }),
    }),
    transaction: (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as DatabaseService['db'];
  return { db, update, insert, lockedTables };
}

describe('AccountActivationService.activate', () => {
  beforeEach(() => jest.mocked(hashPassword).mockReset());

  it('refuses an unknown token with the generic 410 before hashing or locking', async () => {
    const { db, transaction } = databaseWithoutInvitation();
    const service = new AccountActivationService(db);

    const attempt = service.activate(token, 'SufficientlyStrong1!');

    await expect(attempt).rejects.toBeInstanceOf(GoneException);
    await expect(attempt).rejects.toMatchObject({ response: { code: 'invalid_link' } });
    expect(hashPassword).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('refuses with the generic 410 and changes nothing when the user was deactivated before the lock', async () => {
    jest.mocked(hashPassword).mockResolvedValue('$argon2id$hash');
    const { db, update, insert, lockedTables } = databaseWithUserDeactivatedBeforeLock();
    const service = new AccountActivationService(db);

    const attempt = service.activate(token, 'SufficientlyStrong1!');

    await expect(attempt).rejects.toMatchObject({ response: { code: 'invalid_link' } });
    expect(lockedTables).toEqual([users]);
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
