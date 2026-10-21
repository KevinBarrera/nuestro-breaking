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
  correctParticipant,
  swapDiscipline,
  voidRegistration,
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
    channel: 'in_person',
    participant: {
      fullName: 'Alex Rivera',
      firstName: 'Alex',
      firstLastName: 'Rivera',
      secondLastName: null,
      stageName: 'Flash',
    },
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

  it('sends the change reason with the selections only when one is given (#170)', async () => {
    const fetchMock = stubFetch(() => Response.json(entitlements));
    await setPassSelections(eventId, registrationId, registrationPassId, ['act-2'], {
      reason: 'Cambio pedido en mesa',
    });
    expect(JSON.parse(call(fetchMock, 1)[1].body as string)).toEqual({
      activityIds: ['act-2'],
      reason: 'Cambio pedido en mesa',
    });
    await setPassSelections(eventId, registrationId, registrationPassId, [], {});
    expect(JSON.parse(call(fetchMock, 3)[1].body as string)).toEqual({ activityIds: [] });
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

describe('voidRegistration', () => {
  const voided = {
    ...entitlements,
    registration: { ...entitlements.registration, status: 'voided' },
  };

  it('posts the reason with the CSRF token and reads the voided registration (#104)', async () => {
    const fetchMock = stubFetch(() => Response.json(voided));
    expect(await voidRegistration(eventId, registrationId, 'Registro duplicado')).toEqual(voided);
    const [url, init] = call(fetchMock, 1);
    expect(url).toMatch(new RegExp(`${base}/registrations/${registrationId}/void$`));
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-token');
    expect(JSON.parse(init.body as string)).toEqual({ reason: 'Registro duplicado' });
  });

  it('maps a rejected reason to the reason field and an online registration to its rule', async () => {
    stubFetch(() =>
      Response.json(
        {
          statusCode: 400,
          message: 'Reason is required and must be 1 to 500 characters',
          code: 'void_reason_required',
        },
        { status: 400 },
      ),
    );
    expect(await failureOf(voidRegistration(eventId, registrationId, 'x'))).toEqual({
      kind: 'invalid',
      fieldErrors: { reason: 'invalid' },
    });
    stubFetch(() =>
      Response.json(
        {
          statusCode: 409,
          message: 'Online registrations cannot be voided',
          code: 'online_registration_void_locked',
        },
        { status: 409 },
      ),
    );
    expect(await failureOf(voidRegistration(eventId, registrationId, 'x'))).toEqual({
      kind: 'rule',
      code: 'online_registration_void_locked',
    });
  });

  it('reports an unknown outcome when the answer is lost or is not this registration', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await failureOf(voidRegistration(eventId, registrationId, 'x'))).toEqual({
      kind: 'unknown',
    });
    stubFetch(() =>
      Response.json({ ...voided, registration: { ...voided.registration, id: participantId } }),
    );
    expect(await failureOf(voidRegistration(eventId, registrationId, 'x'))).toEqual({
      kind: 'unknown',
    });
  });
});

describe('correctParticipant', () => {
  const correction = {
    firstName: 'Alexa',
    firstLastName: 'Rivera',
    secondLastName: '',
    stageName: 'Flash',
    reason: 'Error de captura',
  };
  const corrected = {
    ...entitlements,
    registration: {
      ...entitlements.registration,
      participant: { ...entitlements.registration.participant, fullName: 'Alexa Rivera' },
    },
  };

  it('posts all four name fields and the reason with the CSRF token (#104)', async () => {
    const fetchMock = stubFetch(() => Response.json(corrected));
    expect(await correctParticipant(eventId, registrationId, correction)).toEqual(corrected);
    const [url, init] = call(fetchMock, 1);
    expect(url).toMatch(
      new RegExp(`${base}/registrations/${registrationId}/participant-correction$`),
    );
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-token');
    // A blank optional part is sent, not omitted, so the stored one is cleared on purpose.
    expect(JSON.parse(init.body as string)).toEqual(correction);
  });

  it('sends the cross-event confirmation only when given', async () => {
    const fetchMock = stubFetch(() => Response.json(corrected));
    await correctParticipant(eventId, registrationId, correction, { confirmCrossEvent: true });
    expect(JSON.parse(call(fetchMock, 1)[1].body as string)).toEqual({
      ...correction,
      confirmCrossEvent: true,
    });
  });

  it('reports the other event count of a cross-event conflict', async () => {
    stubFetch(() =>
      Response.json(
        {
          statusCode: 409,
          message: 'The participant is registered in other events',
          code: 'cross_event_confirmation_required',
          otherEventCount: 1,
        },
        { status: 409 },
      ),
    );
    expect(await failureOf(correctParticipant(eventId, registrationId, correction))).toEqual({
      kind: 'cross_event',
      otherEventCount: 1,
    });
  });

  it('reports an unknown outcome when the answer is lost', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await failureOf(correctParticipant(eventId, registrationId, correction))).toEqual({
      kind: 'unknown',
    });
  });
});

describe('swapDiscipline', () => {
  const targetPassTypeId = 'a2b2c3d4-1234-4567-89ab-123456789abc';
  const activityId = 'b2b2c3d4-1234-4567-89ab-123456789abc';
  const swap = { toPassTypeId: targetPassTypeId, activityIds: [activityId], reason: 'Cambio' };
  const swapped = {
    ...entitlements,
    passes: [{ ...entitlements.passes[0], passTypeId: targetPassTypeId, name: 'Popping' }],
  };
  const reject = (status: number, body: Record<string, unknown>) =>
    stubFetch(() => Response.json({ statusCode: status, ...body }, { status }));

  it('posts the target pass, its competitions and the reason with the CSRF token (#104)', async () => {
    const fetchMock = stubFetch(() => Response.json(swapped));
    expect(await swapDiscipline(eventId, registrationId, swap)).toEqual(swapped);
    const [url, init] = call(fetchMock, 1);
    expect(url).toMatch(new RegExp(`${base}/registrations/${registrationId}/discipline-swap$`));
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-token');
    expect(JSON.parse(init.body as string)).toEqual(swap);
  });

  it('maps a rejected reason and invalid fields to field errors', async () => {
    reject(400, { message: 'Reason is required', code: 'correction_reason_required' });
    expect(await failureOf(swapDiscipline(eventId, registrationId, swap))).toEqual({
      kind: 'invalid',
      fieldErrors: { reason: 'invalid' },
    });
    reject(400, {
      message: 'Invalid discipline swap',
      fieldErrors: { toPassTypeId: 'required', 'activityIds[0]': 'duplicate' },
    });
    expect(await failureOf(swapDiscipline(eventId, registrationId, swap))).toEqual({
      kind: 'invalid',
      fieldErrors: { toPassTypeId: 'required', 'activityIds[0]': 'duplicate' },
    });
  });

  it('maps each swap rule to its code', async () => {
    const rules = [
      [
        409,
        { message: 'Registration is voided', code: 'registration_voided' },
        'registration_voided',
      ],
      [
        409,
        {
          message: 'Registration must hold exactly one full pass',
          code: 'discipline_swap_single_full_pass_required',
        },
        'discipline_swap_single_full_pass_required',
      ],
      [
        409,
        { message: 'Registration is already checked in', code: 'discipline_swap_checked_in' },
        'discipline_swap_checked_in',
      ],
      [
        409,
        {
          message: 'Both passes must have the same current price',
          code: 'discipline_swap_price_mismatch',
        },
        'discipline_swap_price_mismatch',
      ],
      [
        400,
        {
          message: 'Target must be another active full pass of this event',
          code: 'discipline_swap_invalid_target',
        },
        'discipline_swap_invalid_target',
      ],
      [400, { message: 'Invalid activity selection' }, 'invalid_activity_selection'],
    ] as const;
    for (const [status, body, code] of rules) {
      reject(status, body);
      expect(await failureOf(swapDiscipline(eventId, registrationId, swap))).toEqual({
        kind: 'rule',
        code,
      });
    }
  });

  it('reports an unknown outcome when the answer is lost', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await failureOf(swapDiscipline(eventId, registrationId, swap))).toEqual({
      kind: 'unknown',
    });
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
