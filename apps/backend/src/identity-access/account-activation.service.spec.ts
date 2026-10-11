import { GoneException } from '@nestjs/common';
import type { DatabaseService } from '@/database/database.service';
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
 * A database double whose unlocked lookup finds a usable link, but whose locked re-read of the
 * user finds nothing: the user was deactivated between the read and the lock.
 */
function databaseWithUserDeactivatedBeforeLock() {
  const update = jest.fn();
  const insert = jest.fn();
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ for: jest.fn().mockResolvedValue([]) }) }) }),
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
  return { db, update, insert };
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
    const { db, update, insert } = databaseWithUserDeactivatedBeforeLock();
    const service = new AccountActivationService(db);

    const attempt = service.activate(token, 'SufficientlyStrong1!');

    await expect(attempt).rejects.toMatchObject({ response: { code: 'invalid_link' } });
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
