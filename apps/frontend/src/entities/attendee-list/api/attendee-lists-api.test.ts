import { afterEach, describe, expect, it, vi } from 'vitest';
import { attendeeListsFailure, fetchAttendeeLists } from './attendee-lists-api';

const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const empty = {
  event: { id: eventId, name: 'Los más pesados' },
  generatedAt: '2026-11-13T20:00:00.000Z',
  passTypes: [],
  activities: [],
  registrations: [],
};

function stubFetch(answer: () => Promise<Response>) {
  const fetchMock = vi.fn(answer);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function failureOf(answer: () => Promise<Response>) {
  stubFetch(answer);
  return fetchAttendeeLists(eventId, new AbortController().signal).then(
    () => 'resolved',
    (error: unknown) => attendeeListsFailure(error),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchAttendeeLists', () => {
  it('reads the event snapshot with the session cookie', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(Response.json(empty)));

    const lists = await fetchAttendeeLists(eventId, new AbortController().signal);

    expect(lists.event.name).toBe('Los más pesados');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(new RegExp(`/admin/events/${eventId}/attendee-lists$`));
    expect(init.credentials).toBe('include');
  });

  it('maps each failure to the safe class the screen shows', async () => {
    const status = (code: number) => () => Promise.resolve(new Response(null, { status: code }));

    expect(await failureOf(status(401))).toBe('denied');
    expect(await failureOf(status(403))).toBe('denied');
    expect(await failureOf(status(404))).toBe('not-found');
    expect(await failureOf(status(500))).toBe('error');
    expect(await failureOf(() => Promise.reject(new TypeError('offline')))).toBe('error');
    expect(await failureOf(() => Promise.resolve(new Response('not json')))).toBe('error');
    expect(await failureOf(() => Promise.resolve(Response.json({ event: null })))).toBe('error');
  });
});
