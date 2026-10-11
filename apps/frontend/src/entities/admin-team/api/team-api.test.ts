import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelInvitation,
  inviteMember,
  listTeam,
  reactivateMember,
  teamFailure,
} from './team-api';
import type { InviteInput } from './types';

const input: InviteInput = {
  displayName: 'Ana',
  email: 'ana@example.org',
  access: { kind: 'global' },
};

const session = () =>
  new Response('{}', { status: 200, headers: { 'X-CSRF-Token': 'csrf-token' } });

// Answers `GET /auth/session` with `csrf` and every other request with `reply`.
function stubFetch(reply: () => Response | Promise<Response>, csrf = session) {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(url.endsWith('/auth/session') ? csrf() : reply()),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function failureOf(request: Promise<unknown>) {
  try {
    await request;
  } catch (error) {
    return teamFailure(error);
  }
  throw new Error('Expected the request to fail');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('team API outcome of a lost write', () => {
  it('reports an unknown outcome when the write gets no response', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await failureOf(inviteMember(input))).toEqual({ kind: 'unknown' });
  });

  it('reports an unknown outcome when a 2xx body cannot be read', async () => {
    stubFetch(() => new Response('not json', { status: 201 }));
    expect(await failureOf(inviteMember(input))).toEqual({ kind: 'unknown' });
    stubFetch(() => Response.json({ userId: 'u1', activationUrl: 'nope' }, { status: 201 }));
    expect(await failureOf(inviteMember(input))).toEqual({ kind: 'unknown' });
  });

  it('keeps a plain error when nothing was sent or the server refused', async () => {
    const fetchMock = stubFetch(
      () => new Response('{}', { status: 201 }),
      () => {
        throw new TypeError('Failed to fetch');
      },
    );
    expect(await failureOf(inviteMember(input))).toEqual({ kind: 'error' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    stubFetch(() => Response.json({ statusCode: 500 }, { status: 500 }));
    expect(await failureOf(inviteMember(input))).toEqual({ kind: 'error' });
  });
});

describe('team API CSRF prefetch', () => {
  it('maps a 401 or 403 session answer to denied without sending the write', async () => {
    for (const status of [401, 403]) {
      const fetchMock = stubFetch(
        () => new Response('{}', { status: 200 }),
        () => new Response('{}', { status }),
      );
      expect(await failureOf(cancelInvitation('u1'))).toEqual({ kind: 'denied' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('treats a session answer without the X-CSRF-Token header as an error', async () => {
    const fetchMock = stubFetch(
      () => new Response('{}', { status: 200 }),
      () => new Response('{}', { status: 200 }),
    );
    expect(await failureOf(cancelInvitation('u1'))).toEqual({ kind: 'error' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the token from the session header with the write', async () => {
    const fetchMock = stubFetch(() => Response.json({ cancelled: true }));
    await cancelInvitation('u 1');
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/admin\/team\/u%201\/invitation$/);
    expect(init.method).toBe('DELETE');
    expect(init.credentials).toBe('include');
    expect(init.headers).toEqual({ 'X-CSRF-Token': 'csrf-token' });
  });
});

describe('team API reads', () => {
  it('reports a network failure on the list as a failure, not a crash', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const failure = await failureOf(listTeam(new AbortController().signal));
    expect(failure.kind).toBe('unknown');
  });

  it('rethrows the abort when the caller cancelled the list', async () => {
    const controller = new AbortController();
    const abort = new DOMException('Aborted', 'AbortError');
    stubFetch(() => {
      controller.abort();
      return Promise.reject(abort);
    });
    await expect(listTeam(controller.signal)).rejects.toBe(abort);
  });
});

describe('reactivateMember', () => {
  it('resolves to pending for a member who never activated, else active', async () => {
    stubFetch(() => Response.json({ status: 'pending' }));
    expect(await reactivateMember('u1')).toBe('pending');
    stubFetch(() => Response.json({ status: 'active' }));
    expect(await reactivateMember('u1')).toBe('active');
    stubFetch(() => Response.json({}));
    expect(await reactivateMember('u1')).toBe('active');
  });
});
