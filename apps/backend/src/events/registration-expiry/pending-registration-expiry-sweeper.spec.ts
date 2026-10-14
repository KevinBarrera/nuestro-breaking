import { Logger } from '@nestjs/common';
import {
  PendingRegistrationExpirySweeper,
  readExpirySweepInterval,
} from './pending-registration-expiry-sweeper';

describe('readExpirySweepInterval', () => {
  it('defaults to five minutes', () => {
    expect(readExpirySweepInterval({})).toBe(300_000);
  });

  it('accepts 0 (off) and 1000 to 86400000 milliseconds', () => {
    expect(readExpirySweepInterval({ PENDING_EXPIRY_SWEEP_INTERVAL_MS: '0' })).toBe(0);
    expect(readExpirySweepInterval({ PENDING_EXPIRY_SWEEP_INTERVAL_MS: '1000' })).toBe(1_000);
    expect(readExpirySweepInterval({ PENDING_EXPIRY_SWEEP_INTERVAL_MS: '86400000' })).toBe(
      86_400_000,
    );
  });

  it.each(['999', '86400001', '1.5', 'abc'])('rejects %p', (value) => {
    expect(() => readExpirySweepInterval({ PENDING_EXPIRY_SWEEP_INTERVAL_MS: value })).toThrow(
      'PENDING_EXPIRY_SWEEP_INTERVAL_MS must be 0 or a whole number of milliseconds from 1000 to 86400000.',
    );
  });
});

describe('PendingRegistrationExpirySweeper', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function sweeperWith(intervalMs: number, sweep: () => Promise<number>) {
    const sweeper = new PendingRegistrationExpirySweeper({} as never, intervalMs);
    const spy = jest.spyOn(sweeper, 'sweep').mockImplementation(sweep);
    return { sweeper, spy };
  }

  it('sweeps on every interval until the module is destroyed', async () => {
    const { sweeper, spy } = sweeperWith(1_000, () => Promise.resolve(0));

    sweeper.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(3_000);
    expect(spy).toHaveBeenCalledTimes(3);

    await sweeper.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(3_000);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('does not start when the interval is 0', async () => {
    const { sweeper, spy } = sweeperWith(0, () => Promise.resolve(0));

    sweeper.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(10_000);

    expect(spy).not.toHaveBeenCalled();
  });

  it('skips a tick while the previous sweep still runs, and survives a failed sweep', async () => {
    let finish: () => void = () => undefined;
    const { sweeper, spy } = sweeperWith(
      1_000,
      () => new Promise<number>((resolve) => (finish = () => resolve(0))),
    );

    sweeper.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(3_000);
    expect(spy).toHaveBeenCalledTimes(1);

    finish();
    spy.mockImplementation(() => Promise.reject(new Error('database down')));
    await jest.advanceTimersByTimeAsync(1_000);
    spy.mockImplementation(() => Promise.resolve(0));
    await jest.advanceTimersByTimeAsync(1_000);
    expect(spy).toHaveBeenCalledTimes(3);
    await sweeper.onModuleDestroy();
  });
});

describe('PendingRegistrationExpirySweeper.sweep', () => {
  it('keeps sweeping the other events when one event fails, and logs what it voided', async () => {
    const due = [{ eventId: 'event-a' }, { eventId: 'event-b' }];
    const db = {
      selectDistinct: () => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve(due) }) }),
      }),
    };
    const sweeper = new PendingRegistrationExpirySweeper(db as never, 0);
    const sweepEvent = jest
      .spyOn(sweeper as unknown as { sweepEvent: (id: string) => Promise<number> }, 'sweepEvent')
      .mockImplementation((eventId) =>
        eventId === 'event-a' ? Promise.reject(new Error('lock timeout')) : Promise.resolve(2),
      );
    const logs = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const errors = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(sweeper.sweep()).resolves.toBe(2);

    expect(sweepEvent).toHaveBeenCalledTimes(2);
    expect(errors).toHaveBeenCalledWith(
      'Pending registration expiry failed for one event (Error); it is retried on the next tick.',
    );
    expect(logs).toHaveBeenCalledWith('Voided 2 expired pending registrations.');
    logs.mockRestore();
    errors.mockRestore();
  });
});
