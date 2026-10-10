import type { ConfirmationEmailDispatcher } from './confirmation-email-dispatcher';
import { ConfirmationEmailSweeper } from './confirmation-email-sweeper';
import type { EmailConfig } from './email-config';

const CONFIG: EmailConfig = {
  apiKey: 'xkeysib-fake-key',
  senderAddress: 'boletos@example.test',
  senderName: 'Los más pesados',
  sandbox: true,
  dispatchIntervalMs: 1_000,
};

function sweeperWith(sweep: () => Promise<void>, config: EmailConfig = CONFIG) {
  const dispatcher = {
    sweep: jest.fn(sweep),
    whenIdle: jest.fn(() => Promise.resolve()),
  };
  const sweeper = new ConfirmationEmailSweeper(
    config,
    dispatcher as unknown as ConfirmationEmailDispatcher,
  );
  return { sweeper, dispatcher };
}

describe('ConfirmationEmailSweeper', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sweeps on every interval until the module is destroyed', async () => {
    const { sweeper, dispatcher } = sweeperWith(() => Promise.resolve());

    sweeper.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(3_000);
    expect(dispatcher.sweep).toHaveBeenCalledTimes(3);

    await sweeper.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(3_000);
    expect(dispatcher.sweep).toHaveBeenCalledTimes(3);
    expect(dispatcher.whenIdle).toHaveBeenCalled();
  });

  it('never starts when the interval is 0', async () => {
    const { sweeper, dispatcher } = sweeperWith(() => Promise.resolve(), {
      ...CONFIG,
      dispatchIntervalMs: 0,
    });

    sweeper.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(10_000);

    expect(dispatcher.sweep).not.toHaveBeenCalled();
    await sweeper.onModuleDestroy();
  });

  it('skips a tick while the previous sweep still runs', async () => {
    let finish: () => void = () => undefined;
    const slowFirstSweep = new Promise<void>((resolve) => (finish = resolve));
    let calls = 0;
    const { sweeper, dispatcher } = sweeperWith(() =>
      calls++ === 0 ? slowFirstSweep : Promise.resolve(),
    );

    const first = sweeper.tick();
    await sweeper.tick();
    expect(dispatcher.sweep).toHaveBeenCalledTimes(1);

    finish();
    await first;
    await sweeper.tick();
    expect(dispatcher.sweep).toHaveBeenCalledTimes(2);
  });

  it('survives a failed sweep', async () => {
    const { sweeper, dispatcher } = sweeperWith(() => Promise.reject(new Error('db down')));

    await expect(sweeper.tick()).resolves.toBeUndefined();
    await expect(sweeper.tick()).resolves.toBeUndefined();
    expect(dispatcher.sweep).toHaveBeenCalledTimes(2);
  });
});
