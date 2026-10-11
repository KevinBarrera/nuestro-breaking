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
});
