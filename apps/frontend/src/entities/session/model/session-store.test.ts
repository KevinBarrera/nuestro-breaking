import { afterEach, describe, expect, it } from 'vitest';
import { useSessionStore } from './session-store';

const session = {
  user: { id: 'admin-1', displayName: 'Admin', roles: ['admin' as const] },
  expiresAt: '2026-11-14T18:00:00.000Z',
};

afterEach(() => useSessionStore.getState().clearSession());

describe('useSessionStore', () => {
  it('starts without a signed-in user', () => {
    expect(useSessionStore.getState().session).toEqual({ user: null });
  });

  it('keeps the session it is given', () => {
    useSessionStore.getState().setSession(session);
    expect(useSessionStore.getState().session).toEqual(session);
  });

  it('forgets the user and the expiry when cleared', () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().clearSession();
    expect(useSessionStore.getState().session).toEqual({ user: null });
  });
});
