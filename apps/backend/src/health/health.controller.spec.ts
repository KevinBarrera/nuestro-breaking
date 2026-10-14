import { HttpException, HttpStatus } from '@nestjs/common';
import type { DatabaseService } from '@/database/database.service';
import { HEALTH_PING_TIMEOUT_MS, HealthController } from './health.controller';

type Database = DatabaseService['db'];

const controllerWith = (execute: () => Promise<unknown>) =>
  new HealthController({ execute } as unknown as Database);

describe('HealthController', () => {
  it('reports ok when the database answers', async () => {
    await expect(controllerWith(() => Promise.resolve([])).check()).resolves.toEqual({
      status: 'ok',
    });
  });

  it('answers 503 without error details when the database fails', async () => {
    const failing = controllerWith(() =>
      Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=secret')),
    );

    const error = await failing.check().then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect((error as HttpException).getResponse()).toEqual({ status: 'unavailable' });
  });

  it('answers 503 when the database ping does not answer in time', async () => {
    jest.useFakeTimers();
    try {
      const hanging = controllerWith(() => new Promise(() => undefined));
      const result = hanging.check().then(
        () => undefined,
        (caught: unknown) => caught,
      );

      await jest.advanceTimersByTimeAsync(HEALTH_PING_TIMEOUT_MS);
      const error = await result;

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect((error as HttpException).getResponse()).toEqual({ status: 'unavailable' });
    } finally {
      jest.useRealTimers();
    }
  });
});
