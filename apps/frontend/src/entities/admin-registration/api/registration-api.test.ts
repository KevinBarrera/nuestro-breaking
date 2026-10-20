import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addRegistrationPass,
  adminRegistrationFailure,
  confirmCashPayment,
  confirmComplimentary,
  createManualRegistration,
  getRegistrationEntitlements,
  removeRegistrationPass,
  searchRegistrations,
  setPassSelections,
} from './registration-api';
import type { ManualRegistrationInput } from './types';

const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const registrationId = 'b1b2c3d4-1234-4567-89ab-123456789abc';
const participantId = 'c1b2c3d4-1234-4567-89ab-123456789abc';
const auditId = 'd1b2c3d4-1234-4567-89ab-123456789abc';
const passTypeId = 'e1b2c3d4-1234-4567-89ab-123456789abc';
const registrationPassId = 'f1b2c3d4-1234-4567-89ab-123456789abc';
const base = `/admin/events/${eventId}`;

const input: ManualRegistrationInput = {
  firstName: 'Alex',
  firstLastName: 'Rivera',
  email: 'alex@example.com',
  phone: '5512344567',
  stageName: 'Flash',
};
const created = { registrationId, participantId, eventId, status: 'pending_payment', auditId };
const entitlements = {
  registration: {
    id: registrationId,
    status: 'pending_payment',
    folio: null,
    participant: { fullName: 'Alex Rivera', stageName: 'Flash' },
  },
  passes: [
    {
      registrationPassId,
      passTypeId,
      name: 'Pase completo',
      passClass: 'full',
      priceCents: 80000,
      selections: [],
    },
  ],
  accessibleActivityIds: [],
};
const confirmed = { registrationId, eventId, status: 'confirmed', folio: 'LMP-7K3Q', auditId };

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
    return adminRegistrationFailure(error);
  }
  throw new Error('Expected the request to fail');
}

const signal = () => new AbortController().signal;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchRegistrations', () => {
  const page = { total: 0, limit: 10, offset: 20, results: [] };

  it('asks for the trimmed query and the page with credentials, without CSRF', async () => {
    const fetchMock = stubFetch(() => Response.json(page));
    expect(
      await searchRegistrations(eventId, { q: ' LMP-7K ', limit: 10, offset: 20 }, signal()),
    ).toEqual(page);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = call(fetchMock, 0);
    expect(url).toMatch(new RegExp(`${base}/participants\\?q=LMP-7K&limit=10&offset=20$`));
    expect(init.credentials).toBe('include');
    expect(init.method).toBeUndefined();
  });

  it('leaves the page to the backend defaults and encodes the query', async () => {
    const fetchMock = stubFetch(() => Response.json({ ...page, limit: 20, offset: 0 }));
    await searchRegistrations(eventId, { q: 'Ana & Flash' }, signal());
    expect(call(fetchMock, 0)[0]).toMatch(/\/participants\?q=Ana\+%26\+Flash$/);
  });

  it('rejects a query outside 2 to 200 characters without a request', async () => {
    const fetchMock = stubFetch(() => Response.json(page));
    for (const q of [' a ', 'x'.repeat(201)])
      expect(await failureOf(searchRegistrations(eventId, { q }, signal()))).toEqual({
        kind: 'invalid',
        fieldErrors: { q: 'invalid' },
      });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a denied session and a malformed or lost answer', async () => {
    stubFetch(() => Response.json({ message: 'Unauthenticated' }, { status: 401 }));
    expect(await failureOf(searchRegistrations(eventId, { q: 'Ana' }, signal()))).toEqual({
      kind: 'unauthorized',
    });
    stubFetch(() => Response.json({ total: 1, results: [{}] }));
    expect(await failureOf(searchRegistrations(eventId, { q: 'Ana' }, signal()))).toEqual({
      kind: 'error',
    });
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await failureOf(searchRegistrations(eventId, { q: 'Ana' }, signal()))).toEqual({
      kind: 'error',
    });
  });

  it('rethrows the abort when the caller cancelled the search', async () => {
    const controller = new AbortController();
    const abort = new DOMException('Aborted', 'AbortError');
    stubFetch(() => {
      controller.abort();
      return Promise.reject(abort);
    });
    await expect(searchRegistrations(eventId, { q: 'Ana' }, controller.signal)).rejects.toBe(abort);
  });
});

describe('getRegistrationEntitlements', () => {
  it('reads the entitlements with credentials, without CSRF', async () => {
    const fetchMock = stubFetch(() => Response.json(entitlements));
    expect(await getRegistrationEntitlements(eventId, registrationId, signal())).toEqual(
      entitlements,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = call(fetchMock, 0);
    expect(url).toMatch(new RegExp(`${base}/registrations/${registrationId}/entitlements$`));
    expect(init.credentials).toBe('include');
  });

  it('maps an unknown registration and a malformed answer', async () => {
    stubFetch(() => Response.json({ message: 'Registration not found' }, { status: 404 }));
    expect(await failureOf(getRegistrationEntitlements(eventId, registrationId, signal()))).toEqual(
      { kind: 'not_found' },
    );
    stubFetch(() => Response.json({ passes: null }));
    expect(await failureOf(getRegistrationEntitlements(eventId, registrationId, signal()))).toEqual(
      { kind: 'error' },
    );
    // An answer about another registration never reaches the screen.
    const otherRegistration = { ...entitlements.registration, id: participantId };
    stubFetch(() => Response.json({ ...entitlements, registration: otherRegistration }));
    expect(await failureOf(getRegistrationEntitlements(eventId, registrationId, signal()))).toEqual(
      { kind: 'error' },
    );
  });
});

describe('createManualRegistration', () => {
  it('posts the participant fields with the CSRF token and reads the answer', async () => {
    const fetchMock = stubFetch(() => Response.json(created, { status: 201 }));
    expect(await createManualRegistration(eventId, input)).toEqual(created);
    const [url, init] = call(fetchMock, 1);
    expect(url).toMatch(new RegExp(`${base}/registrations/manual$`));
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers).toEqual({
      'X-CSRF-Token': 'csrf-token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body as string)).toEqual(input);
  });

  it('sends the confirmed duplicates and never activity ids', async () => {
    const fetchMock = stubFetch(() => Response.json(created, { status: 201 }));
    const extra = { ...input, activityIds: [passTypeId] } as ManualRegistrationInput;
    await createManualRegistration(eventId, extra, {
      confirmedDuplicateRegistrationIds: [registrationPassId],
    });
    const body = JSON.parse(call(fetchMock, 1)[1].body as string) as Record<string, unknown>;
    expect(body).toEqual({ ...input, confirmedDuplicateRegistrationIds: [registrationPassId] });
    expect(body).not.toHaveProperty('activityIds');
  });

  it('maps field errors and possible duplicates', async () => {
    stubFetch(() =>
      Response.json(
        { message: 'Invalid manual registration', fieldErrors: { phone: 'invalid' } },
        { status: 400 },
      ),
    );
    expect(await failureOf(createManualRegistration(eventId, input))).toEqual({
      kind: 'invalid',
      fieldErrors: { phone: 'invalid' },
    });
    const match = {
      registrationId,
      fullName: 'Alex Rivera',
      stageName: 'Flash',
      folio: null,
      status: 'pending_payment',
      maskedEmail: 'a***@example.com',
      maskedPhone: '******4567',
    };
    stubFetch(() =>
      Response.json(
        {
          statusCode: 409,
          message: 'Possible duplicate registrations need confirmation',
          code: 'possible_duplicates',
          matches: [match],
        },
        { status: 409 },
      ),
    );
    expect(await failureOf(createManualRegistration(eventId, input))).toEqual({
      kind: 'possible_duplicates',
      matches: [match],
    });
  });
});

describe('registration passes', () => {
  it('posts the pass type and reads the entitlements', async () => {
    const fetchMock = stubFetch(() => Response.json(entitlements, { status: 201 }));
    expect(await addRegistrationPass(eventId, registrationId, passTypeId)).toEqual(entitlements);
    const [url, init] = call(fetchMock, 1);
    expect(url).toMatch(new RegExp(`${base}/registrations/${registrationId}/passes$`));
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-token');
    expect(JSON.parse(init.body as string)).toEqual({ passTypeId });
  });

  it('maps the full-includes-general rule', async () => {
    stubFetch(() =>
      Response.json({ message: 'A full pass already includes general entry' }, { status: 409 }),
    );
    expect(await failureOf(addRegistrationPass(eventId, registrationId, passTypeId))).toEqual({
      kind: 'rule',
      code: 'full_includes_general',
    });
  });

  it('replaces the selections with PUT and reads the entitlements', async () => {
    const fetchMock = stubFetch(() => Response.json(entitlements));
    expect(await setPassSelections(eventId, registrationId, registrationPassId, ['act-1'])).toEqual(
      entitlements,
    );
    const [url, init] = call(fetchMock, 1);
    expect(url).toMatch(
      new RegExp(
        `${base}/registrations/${registrationId}/passes/${registrationPassId}/selections$`,
      ),
    );
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ activityIds: ['act-1'] });
  });

  it('removes a held pass with DELETE and the CSRF token, and reads the entitlements', async () => {
    const fetchMock = stubFetch(() => Response.json(entitlements));
    expect(await removeRegistrationPass(eventId, registrationId, registrationPassId)).toEqual(
      entitlements,
    );
    const [url, init] = call(fetchMock, 1);
    expect(url).toMatch(
      new RegExp(`${base}/registrations/${registrationId}/passes/${registrationPassId}$`),
    );
    expect(init.method).toBe('DELETE');
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-token');
    expect(init.body).toBeUndefined();
  });

  it('maps the removal rules and a malformed answer', async () => {
    stubFetch(() =>
      Response.json({ message: 'Online registrations cannot lose a pass' }, { status: 409 }),
    );
    expect(
      await failureOf(removeRegistrationPass(eventId, registrationId, registrationPassId)),
    ).toEqual({ kind: 'rule', code: 'online_registration_pass_locked' });
    stubFetch(() =>
      Response.json(
        {
          message: 'Remove «Open Styles» first; it requires this pass',
          code: 'pass_required_by_add_on',
        },
        { status: 409 },
      ),
    );
    expect(
      await failureOf(removeRegistrationPass(eventId, registrationId, registrationPassId)),
    ).toEqual({ kind: 'rule', code: 'pass_required_by_add_on' });
    stubFetch(() => Response.json({ passes: [] }));
    expect(
      await failureOf(removeRegistrationPass(eventId, registrationId, registrationPassId)),
    ).toEqual({ kind: 'unknown' });
  });
});

describe('confirmCashPayment', () => {
  it('posts the amount in cents and the receipt as the backend names them', async () => {
    const fetchMock = stubFetch(() => Response.json(confirmed, { status: 201 }));
    expect(
      await confirmCashPayment(eventId, registrationId, {
        amountCents: 80000,
        receipt: 'A-17',
        note: 'Pagó en taquilla',
      }),
    ).toEqual(confirmed);
    const [url, init] = call(fetchMock, 1);
    expect(url).toMatch(new RegExp(`${base}/registrations/${registrationId}/cash-confirmation$`));
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      amount: 80000,
      receipt: 'A-17',
      note: 'Pagó en taquilla',
    });
  });

  it('maps a taken receipt to its rule', async () => {
    stubFetch(() =>
      Response.json(
        { message: 'Receipt number already used in this event', code: 'receipt_taken' },
        { status: 409 },
      ),
    );
    expect(
      await failureOf(
        confirmCashPayment(eventId, registrationId, { amountCents: 1, receipt: 'A' }),
      ),
    ).toEqual({ kind: 'rule', code: 'receipt_taken' });
  });
});

describe('confirmComplimentary', () => {
  it('posts the reason with the CSRF token and reads the confirmation', async () => {
    const fetchMock = stubFetch(() => Response.json(confirmed, { status: 201 }));
    expect(
      await confirmComplimentary(eventId, registrationId, { reason: 'Golden ticket, ganador' }),
    ).toEqual(confirmed);
    const [url, init] = call(fetchMock, 1);
    expect(url).toMatch(
      new RegExp(`${base}/registrations/${registrationId}/complimentary-confirmation$`),
    );
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-token');
    expect(JSON.parse(init.body as string)).toEqual({ reason: 'Golden ticket, ganador' });
  });

  it('maps the no-passes and non-zero-total conflicts to their rules', async () => {
    const reason = { reason: 'Invitado' };
    stubFetch(() =>
      Response.json(
        { statusCode: 409, message: 'Registration holds no passes', code: 'no_passes' },
        { status: 409 },
      ),
    );
    expect(await failureOf(confirmComplimentary(eventId, registrationId, reason))).toEqual({
      kind: 'rule',
      code: 'no_passes',
    });
    stubFetch(() =>
      Response.json(
        {
          statusCode: 409,
          message: 'Registration passes do not total zero',
          code: 'not_zero_total',
        },
        { status: 409 },
      ),
    );
    expect(await failureOf(confirmComplimentary(eventId, registrationId, reason))).toEqual({
      kind: 'rule',
      code: 'not_zero_total',
    });
  });

  it('reports an unknown outcome when the answer is lost or malformed', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(
      await failureOf(confirmComplimentary(eventId, registrationId, { reason: 'Invitado' })),
    ).toEqual({ kind: 'unknown' });
    stubFetch(() =>
      Response.json({ ...confirmed, registrationId: participantId }, { status: 201 }),
    );
    expect(
      await failureOf(confirmComplimentary(eventId, registrationId, { reason: 'Invitado' })),
    ).toEqual({ kind: 'unknown' });
  });
});

describe('registration API outcome of a lost write', () => {
  const cash = () => confirmCashPayment(eventId, registrationId, { amountCents: 1, receipt: 'A' });

  it('reports an unknown outcome when the write gets no response', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await failureOf(cash())).toEqual({ kind: 'unknown' });
    expect(await failureOf(createManualRegistration(eventId, input))).toEqual({ kind: 'unknown' });
  });

  it('reports an unknown outcome when a 2xx body is unreadable or malformed', async () => {
    stubFetch(() => new Response('not json', { status: 201 }));
    expect(await failureOf(cash())).toEqual({ kind: 'unknown' });
    stubFetch(() => Response.json({ ...confirmed, folio: null }, { status: 201 }));
    expect(await failureOf(cash())).toEqual({ kind: 'unknown' });
    stubFetch(() => Response.json({ passes: [] }, { status: 201 }));
    expect(await failureOf(addRegistrationPass(eventId, registrationId, passTypeId))).toEqual({
      kind: 'unknown',
    });
  });

  it('keeps a plain error when the CSRF prefetch fails, without sending the write', async () => {
    const fetchMock = stubFetch(
      () => Response.json(confirmed, { status: 201 }),
      () => {
        throw new TypeError('Failed to fetch');
      },
    );
    expect(await failureOf(cash())).toEqual({ kind: 'error' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps a 401 or 403 session answer without sending the write', async () => {
    for (const [status, kind] of [
      [401, 'unauthorized'],
      [403, 'forbidden'],
    ] as const) {
      const fetchMock = stubFetch(
        () => Response.json(confirmed, { status: 201 }),
        () => new Response('{}', { status }),
      );
      expect(await failureOf(cash())).toEqual({ kind });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });
});
