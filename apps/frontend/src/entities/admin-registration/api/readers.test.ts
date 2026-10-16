import { describe, expect, it } from 'vitest';
import {
  readCashConfirmation,
  readEntitlements,
  readManualRegistration,
  readRegistrationFailure,
  readSearchPage,
} from './readers';

const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const registrationId = 'b1b2c3d4-1234-4567-89ab-123456789abc';
const participantId = 'c1b2c3d4-1234-4567-89ab-123456789abc';
const auditId = 'd1b2c3d4-1234-4567-89ab-123456789abc';

const result = {
  participant: { id: participantId, fullName: 'Alex Rivera', email: null, stageName: 'Flash' },
  registration: {
    id: registrationId,
    eventId,
    folio: 'LMP-7K3Q',
    status: 'confirmed',
    checkedInAt: null,
  },
  activities: [{ id: 'act-1', name: 'Breaking 1vs1', kind: 'battle', checkedInAt: null }],
};
const page = { total: 1, limit: 20, offset: 0, results: [result] };

describe('readSearchPage', () => {
  it('reads the page and its results, ignoring extra fields', () => {
    expect(readSearchPage({ ...page, extra: true }, eventId)).toEqual(page);
    const checkedIn = {
      ...result,
      participant: { ...result.participant, email: 'alex@example.com', stageName: null },
      registration: { ...result.registration, checkedInAt: '2026-11-21T17:00:00.000Z' },
    };
    expect(readSearchPage({ ...page, results: [checkedIn] }, eventId)?.results).toEqual([
      checkedIn,
    ]);
  });

  it('rejects the whole page when one result is malformed', () => {
    for (const bad of [
      { ...result, participant: { ...result.participant, fullName: '' } },
      { ...result, participant: { ...result.participant, email: undefined } },
      { ...result, registration: { ...result.registration, id: 'sample' } },
      { ...result, registration: { ...result.registration, eventId: participantId } },
      { ...result, registration: { ...result.registration, status: 'paid' } },
      { ...result, registration: { ...result.registration, checkedInAt: 'today' } },
      { ...result, activities: [{ id: 'act-1', name: 'Breaking' }] },
      { ...result, activities: null },
    ])
      expect(readSearchPage({ ...page, results: [result, bad] }, eventId)).toBeNull();
    expect(readSearchPage({ ...page, total: -1 }, eventId)).toBeNull();
    expect(readSearchPage({ ...page, results: undefined }, eventId)).toBeNull();
    expect(readSearchPage([], eventId)).toBeNull();
  });
});

describe('readManualRegistration', () => {
  const created = {
    registrationId,
    participantId,
    eventId,
    status: 'pending_payment',
    auditId,
  };

  it('reads the created registration', () => {
    expect(readManualRegistration({ ...created, extra: 1 }, eventId)).toEqual(created);
  });

  it('rejects another event, another status or a missing id', () => {
    expect(readManualRegistration({ ...created, eventId: participantId }, eventId)).toBeNull();
    expect(readManualRegistration({ ...created, status: 'confirmed' }, eventId)).toBeNull();
    expect(readManualRegistration({ ...created, registrationId: 'x' }, eventId)).toBeNull();
    expect(readManualRegistration({ ...created, auditId: undefined }, eventId)).toBeNull();
  });
});

describe('readCashConfirmation', () => {
  const confirmed = { registrationId, eventId, status: 'confirmed', folio: 'LMP-7K3Q', auditId };

  it('reads the confirmation with its folio', () => {
    expect(readCashConfirmation(confirmed, eventId, registrationId)).toEqual(confirmed);
  });

  it('rejects a confirmation without folio or for another registration', () => {
    expect(readCashConfirmation({ ...confirmed, folio: null }, eventId, registrationId)).toBeNull();
    expect(
      readCashConfirmation({ ...confirmed, status: 'pending_payment' }, eventId, registrationId),
    ).toBeNull();
    expect(readCashConfirmation(confirmed, eventId, participantId)).toBeNull();
  });
});

describe('readEntitlements', () => {
  const pass = {
    registrationPassId: 'f1b2c3d4-1234-4567-89ab-123456789abc',
    passTypeId: 'e1b2c3d4-1234-4567-89ab-123456789abc',
    name: 'Pase completo',
    passClass: 'full',
    priceCents: 80000,
    selections: ['act-1'],
  };
  const registration = {
    id: registrationId,
    status: 'pending_payment',
    folio: null,
    participant: { fullName: 'Alex Rivera', stageName: 'Flash' },
  };
  const entitlements = {
    registration,
    passes: [pass],
    accessibleActivityIds: ['act-1', 'act-2'],
  };

  it('reads the registration summary, held passes and accessible activities', () => {
    expect(readEntitlements(entitlements, registrationId)).toEqual(entitlements);
    const confirmed = {
      ...registration,
      status: 'confirmed',
      folio: 'LMP-7K3Q',
      participant: { fullName: 'Alex Rivera', stageName: null },
    };
    expect(
      readEntitlements(
        { registration: confirmed, passes: [], accessibleActivityIds: [] },
        registrationId,
      ),
    ).toEqual({ registration: confirmed, passes: [], accessibleActivityIds: [] });
  });

  it('keeps only the name and AKA of the participant', () => {
    const extra = {
      ...entitlements,
      registration: {
        ...registration,
        eventId,
        participant: { ...registration.participant, email: 'alex@example.com' },
      },
    };
    expect(readEntitlements(extra, registrationId)).toEqual(entitlements);
  });

  it('rejects a missing or malformed registration summary', () => {
    for (const bad of [
      undefined,
      null,
      { ...registration, id: 'x' },
      { ...registration, id: participantId },
      { ...registration, status: 'paid' },
      { ...registration, folio: '' },
      { ...registration, participant: null },
      { ...registration, participant: { fullName: '', stageName: null } },
      { ...registration, participant: { fullName: 'Alex Rivera' } },
    ])
      expect(readEntitlements({ ...entitlements, registration: bad }, registrationId)).toBeNull();
  });

  it('rejects a malformed pass or list', () => {
    for (const bad of [
      { ...pass, registrationPassId: 'x' },
      { ...pass, passClass: 'vip' },
      { ...pass, priceCents: -1 },
      { ...pass, priceCents: 1.5 },
      { ...pass, selections: [1] },
      { ...pass, name: '' },
    ])
      expect(readEntitlements({ ...entitlements, passes: [pass, bad] }, registrationId)).toBeNull();
    expect(
      readEntitlements({ ...entitlements, accessibleActivityIds: null }, registrationId),
    ).toBeNull();
    expect(readEntitlements(null, registrationId)).toBeNull();
  });
});

describe('readRegistrationFailure', () => {
  it('maps 401, 403 and 404', () => {
    expect(readRegistrationFailure(401, { message: 'Unauthenticated' })).toEqual({
      kind: 'unauthorized',
    });
    expect(readRegistrationFailure(403, { message: 'Request denied' })).toEqual({
      kind: 'forbidden',
    });
    expect(readRegistrationFailure(404, { message: 'Registration not found' })).toEqual({
      kind: 'not_found',
    });
  });

  it('keeps only string field error codes on a 400', () => {
    expect(
      readRegistrationFailure(400, {
        message: 'Invalid manual registration',
        fieldErrors: { email: 'invalid', phone: 3, birthDate: 'in_future' },
      }),
    ).toEqual({ kind: 'invalid', fieldErrors: { email: 'invalid', birthDate: 'in_future' } });
    expect(readRegistrationFailure(400, null)).toEqual({ kind: 'invalid', fieldErrors: {} });
    expect(readRegistrationFailure(400, { message: 'Invalid optional field' })).toEqual({
      kind: 'invalid',
      fieldErrors: {},
    });
  });

  it('maps the cash confirmation field messages to the input fields', () => {
    expect(readRegistrationFailure(400, { message: 'Invalid amount in cents' })).toEqual({
      kind: 'invalid',
      fieldErrors: { amountCents: 'invalid' },
    });
    expect(
      readRegistrationFailure(400, {
        message: 'Receipt number is required and must be 1 to 50 characters',
      }),
    ).toEqual({ kind: 'invalid', fieldErrors: { receipt: 'invalid' } });
  });

  it('maps the known entitlement and cash rule messages to stable codes', () => {
    for (const [status, message, code] of [
      [409, 'Pass type is archived', 'pass_type_archived'],
      [409, 'Registration is not pending payment', 'registration_not_pending'],
      [400, 'Registration is not pending in this event', 'registration_not_pending'],
      [409, 'Registration already holds this pass type', 'pass_already_held'],
      [409, 'A full pass already includes general entry', 'full_includes_general'],
      [400, 'Add-on requires a full pass', 'add_on_requires_full'],
      [400, 'Add-on requires a general pass', 'add_on_requires_general'],
      [400, 'Invalid activity selection', 'invalid_activity_selection'],
      [409, 'Registration is voided', 'registration_voided'],
    ] as const)
      expect(readRegistrationFailure(status, { statusCode: status, message })).toEqual({
        kind: 'rule',
        code,
      });
  });

  it('maps a taken receipt by its code', () => {
    expect(
      readRegistrationFailure(409, {
        message: 'Receipt number already used in this event',
        code: 'receipt_taken',
      }),
    ).toEqual({ kind: 'rule', code: 'receipt_taken' });
  });

  it('reads the possible duplicates with their masked contact', () => {
    const match = {
      registrationId,
      fullName: 'Alex Rivera',
      stageName: 'Flash',
      folio: null,
      status: 'pending_payment',
      maskedEmail: 'a***@example.com',
      maskedPhone: '******4567',
    };
    const other = {
      ...match,
      registrationId: participantId,
      stageName: null,
      folio: 'LMP-7K3Q',
      status: 'confirmed',
      maskedEmail: null,
      maskedPhone: null,
    };
    expect(
      readRegistrationFailure(409, {
        message: 'Possible duplicate registrations need confirmation',
        code: 'possible_duplicates',
        matches: [{ ...match, extra: 1 }, other],
      }),
    ).toEqual({ kind: 'possible_duplicates', matches: [match, other] });
  });

  it('treats malformed duplicates as a plain error, so none is confirmed unseen', () => {
    const match = {
      registrationId,
      fullName: 'Alex Rivera',
      stageName: null,
      folio: null,
      status: 'pending_payment',
      maskedEmail: null,
      maskedPhone: null,
    };
    for (const matches of [
      undefined,
      [],
      [{ ...match, registrationId: 'x' }],
      [{ ...match, status: 'voided' }],
    ])
      expect(readRegistrationFailure(409, { code: 'possible_duplicates', matches })).toEqual({
        kind: 'error',
      });
  });

  it('treats unknown codes, messages and statuses as a plain error', () => {
    expect(readRegistrationFailure(409, { code: 'something_else' })).toEqual({ kind: 'error' });
    expect(readRegistrationFailure(409, { message: 'Other conflict' })).toEqual({ kind: 'error' });
    expect(readRegistrationFailure(500, { message: 'private' })).toEqual({ kind: 'error' });
  });
});
