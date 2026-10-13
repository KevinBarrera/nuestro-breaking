import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adminEventFailure,
  createEvent,
  deleteEvent,
  getEventFoundation,
  listAdminEvents,
  renameVenue,
  restoreEvent,
} from './event-api';
import type { CreateEventInput } from './types';

const id = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const input: CreateEventInput = {
  name: 'Los más pesados',
  slug: 'los-mas-pesados',
  folioPrefix: 'LMP',
  timeZone: 'America/Mexico_City',
  startsAt: null,
  endsAt: null,
};
const event = {
  id,
  name: input.name,
  slug: input.slug,
  folioPrefix: input.folioPrefix,
  archivedAt: null,
  timeZone: input.timeZone,
  startsAt: null,
  endsAt: null,
  salesEnabled: false,
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

const call = (fetchMock: ReturnType<typeof stubFetch>, index: number) =>
  fetchMock.mock.calls[index] as unknown as [string, RequestInit];

async function failureOf(request: Promise<unknown>) {
  try {
    await request;
  } catch (error) {
    return adminEventFailure(error);
  }
  throw new Error('Expected the request to fail');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listAdminEvents', () => {
  it('asks for archived events only when requested', async () => {
    const fetchMock = stubFetch(() => Response.json([]));
    await listAdminEvents(new AbortController().signal);
    await listAdminEvents(new AbortController().signal, { archived: true });
    expect(call(fetchMock, 0)[0]).toMatch(/\/admin\/events$/);
    expect(call(fetchMock, 1)[0]).toMatch(/\/admin\/events\?archived=true$/);
    expect(call(fetchMock, 0)[1].credentials).toBe('include');
  });

  it('fails as an error when the list is malformed', async () => {
    stubFetch(() => Response.json([{ id: 'sample', name: 'Falso' }]));
    expect(await failureOf(listAdminEvents(new AbortController().signal))).toEqual({
      kind: 'error',
    });
  });

  it('rethrows the abort when the caller cancelled the list', async () => {
    const controller = new AbortController();
    const abort = new DOMException('Aborted', 'AbortError');
    stubFetch(() => {
      controller.abort();
      return Promise.reject(abort);
    });
    await expect(listAdminEvents(controller.signal)).rejects.toBe(abort);
  });
});

describe('getEventFoundation', () => {
  it('reads the event and venues of the foundation with credentials', async () => {
    const venues = [{ id: 'v1', name: 'Centro cultural' }];
    const fetchMock = stubFetch(() => Response.json({ event, venues, activities: [] }));
    expect(await getEventFoundation(id, new AbortController().signal)).toEqual({ event, venues });
    expect(call(fetchMock, 0)[0]).toMatch(new RegExp(`/admin/events/${id}/foundation$`));
    expect(call(fetchMock, 0)[1].credentials).toBe('include');
  });

  it('maps a missing event and a malformed answer', async () => {
    stubFetch(() => Response.json({ message: 'Event not found' }, { status: 404 }));
    expect(await failureOf(getEventFoundation(id, new AbortController().signal))).toEqual({
      kind: 'not_found',
    });
    stubFetch(() => Response.json({ event: { id }, venues: [] }));
    expect(await failureOf(getEventFoundation(id, new AbortController().signal))).toEqual({
      kind: 'error',
    });
  });
});

describe('event writes', () => {
  it('posts the new event with the CSRF token and reads the answer', async () => {
    const fetchMock = stubFetch(() => Response.json(event, { status: 201 }));
    expect(await createEvent(input)).toEqual(event);
    const [url, init] = call(fetchMock, 1);
    expect(url).toMatch(/\/admin\/events$/);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers).toEqual({
      'X-CSRF-Token': 'csrf-token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body as string)).toEqual(input);
  });

  it('maps a taken slug to its rule', async () => {
    stubFetch(() =>
      Response.json({ code: 'slug_taken', fieldErrors: { slug: 'taken' } }, { status: 409 }),
    );
    expect(await failureOf(createEvent(input))).toEqual({ kind: 'rule', code: 'slug_taken' });
  });

  it('sends the typed slug when deleting and accepts the empty 204', async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 204 }));
    await deleteEvent('e 1', 'los-mas-pesados');
    const [url, init] = call(fetchMock, 1);
    expect(url).toMatch(/\/admin\/events\/e%201$/);
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body as string)).toEqual({ confirmSlug: 'los-mas-pesados' });
  });

  it('posts restore without a body', async () => {
    const fetchMock = stubFetch(() => Response.json(event, { status: 201 }));
    expect(await restoreEvent(id)).toEqual(event);
    const [url, init] = call(fetchMock, 1);
    expect(url).toMatch(new RegExp(`/admin/events/${id}/restore$`));
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });

  it('renames a venue with PATCH', async () => {
    const fetchMock = stubFetch(() => Response.json({ id: 'v1', name: 'Foro' }));
    expect(await renameVenue(id, 'v1', 'Foro')).toEqual({ id: 'v1', name: 'Foro' });
    const [url, init] = call(fetchMock, 1);
    expect(url).toMatch(new RegExp(`/admin/events/${id}/venues/v1$`));
    expect(init.method).toBe('PATCH');
  });
});

describe('event API outcome of a lost write', () => {
  it('reports an unknown outcome when the write gets no response', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await failureOf(createEvent(input))).toEqual({ kind: 'unknown' });
  });

  it('reports an unknown outcome when a 2xx body is unreadable or malformed', async () => {
    stubFetch(() => new Response('not json', { status: 201 }));
    expect(await failureOf(createEvent(input))).toEqual({ kind: 'unknown' });
    stubFetch(() => Response.json({ id }, { status: 201 }));
    expect(await failureOf(createEvent(input))).toEqual({ kind: 'unknown' });
  });

  it('keeps a plain error when the CSRF prefetch fails, without sending the write', async () => {
    const fetchMock = stubFetch(
      () => Response.json(event, { status: 201 }),
      () => {
        throw new TypeError('Failed to fetch');
      },
    );
    expect(await failureOf(createEvent(input))).toEqual({ kind: 'error' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps a 401 or 403 session answer without sending the write', async () => {
    for (const [status, kind] of [
      [401, 'unauthorized'],
      [403, 'forbidden'],
    ] as const) {
      const fetchMock = stubFetch(
        () => Response.json(event, { status: 201 }),
        () => new Response('{}', { status }),
      );
      expect(await failureOf(restoreEvent(id))).toEqual({ kind });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });
});
