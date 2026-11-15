import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminFetch, onSessionEnded } from './admin-fetch';

describe('adminFetch (#392)', () => {
  afterEach(() => vi.unstubAllGlobals());

  function respondWith(status: number) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));
  }

  it('reports an ended session when the API answers 401', async () => {
    respondWith(401);
    const listener = vi.fn();
    const stop = onSessionEnded(listener);
    const response = await adminFetch('http://api.test/admin/team', { credentials: 'include' });
    stop();
    expect(response.status).toBe(401);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it.each([200, 403, 500])('does not report an ended session for %i', async (status) => {
    respondWith(status);
    const listener = vi.fn();
    const stop = onSessionEnded(listener);
    await adminFetch('http://api.test/admin/team');
    stop();
    expect(listener).not.toHaveBeenCalled();
  });

  it('stops notifying a listener after it unsubscribes', async () => {
    respondWith(401);
    const listener = vi.fn();
    onSessionEnded(listener)();
    await adminFetch('http://api.test/admin/team');
    expect(listener).not.toHaveBeenCalled();
  });

  it('passes the request through to fetch unchanged', async () => {
    respondWith(200);
    const init = { method: 'POST', credentials: 'include' as const };
    await adminFetch('http://api.test/admin/events', init);
    expect(fetch).toHaveBeenCalledWith('http://api.test/admin/events', init);
  });
});
