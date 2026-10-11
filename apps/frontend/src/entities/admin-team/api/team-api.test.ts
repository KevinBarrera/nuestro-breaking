import { afterEach, describe, expect, it, vi } from 'vitest';
import { inviteMember, teamFailure } from './team-api';
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
