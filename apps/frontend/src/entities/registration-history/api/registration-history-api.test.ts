import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRegistrationHistory, registrationHistoryFailure } from './registration-history-api';

const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const empty = {
  items: [],
  nextCursor: null,
  counts: { all: 0, corrections: 0, on_site: 0, complimentary: 0 },
};

function stubFetch(answer: () => Promise<Response>) {
  const fetchMock = vi.fn(answer);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function failureOf(answer: () => Promise<Response>) {
  stubFetch(answer);
  return getRegistrationHistory(eventId, { filter: 'all' }, new AbortController().signal).then(
    () => 'resolved',
    (error: unknown) => registrationHistoryFailure(error),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getRegistrationHistory', () => {
  it('reads the first page with the session cookie and the filter', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(Response.json(empty)));

    const history = await getRegistrationHistory(
      eventId,
      { filter: 'corrections' },
      new AbortController().signal,
    );

    expect(history).toEqual(empty);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const requested = new URL(url);
    expect(requested.pathname).toBe(`/admin/events/${eventId}/registration-history`);
    expect([...requested.searchParams]).toEqual([['filter', 'corrections']]);
    expect(init.credentials).toBe('include');
  });

  it('asks for the page after a cursor', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(Response.json(empty)));

    await getRegistrationHistory(
      eventId,
      { filter: 'all', cursor: 'abc_-1' },
      new AbortController().signal,
    );

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(Object.fromEntries(new URL(url).searchParams)).toEqual({
      filter: 'all',
      cursor: 'abc_-1',
    });
  });

  it('sends the search and the new filters (#356)', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(Response.json(empty)));

    await getRegistrationHistory(
      eventId,
      { filter: 'on_site', q: 'EV-Y64P', cursor: 'abc' },
      new AbortController().signal,
    );
    await getRegistrationHistory(
      eventId,
      { filter: 'complimentary', q: '' },
      new AbortController().signal,
    );

    const urls = (fetchMock.mock.calls as unknown as [string][]).map(([url]) => new URL(url));
    expect(Object.fromEntries(urls[0].searchParams)).toEqual({
      filter: 'on_site',
      q: 'EV-Y64P',
      cursor: 'abc',
    });
    expect([...urls[1].searchParams]).toEqual([['filter', 'complimentary']]);
  });

  it('maps each failure to the safe class the screen shows', async () => {
    const status = (code: number) => () => Promise.resolve(new Response(null, { status: code }));

    expect(await failureOf(status(401))).toBe('denied');
    expect(await failureOf(status(403))).toBe('denied');
    expect(await failureOf(status(404))).toBe('not-found');
    expect(await failureOf(status(400))).toBe('error');
    expect(await failureOf(status(500))).toBe('error');
    expect(await failureOf(() => Promise.reject(new TypeError('offline')))).toBe('error');
    expect(await failureOf(() => Promise.resolve(new Response('not json')))).toBe('error');
    expect(await failureOf(() => Promise.resolve(Response.json({ items: null })))).toBe('error');
  });
});
