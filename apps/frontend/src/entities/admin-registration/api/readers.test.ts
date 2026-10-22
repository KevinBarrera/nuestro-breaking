import { describe, expect, it } from 'vitest';
import {
  readConfirmation,
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
  activities: [{ id: 'act-1', name: 'Breaking 1vs1', kind: 'competition', checkedInAt: null }],
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

describe('readConfirmation', () => {
  const confirmed = { registrationId, eventId, status: 'confirmed', folio: 'LMP-7K3Q', auditId };

  it('reads the confirmation with its folio', () => {
    expect(readConfirmation(confirmed, eventId, registrationId)).toEqual(confirmed);
  });

  it('rejects a confirmation without folio or for another registration', () => {
    expect(readConfirmation({ ...confirmed, folio: null }, eventId, registrationId)).toBeNull();
    expect(
      readConfirmation({ ...confirmed, status: 'pending_payment' }, eventId, registrationId),
    ).toBeNull();
    expect(readConfirmation(confirmed, eventId, participantId)).toBeNull();
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
    channel: 'in_person',
    cash: null,
    participant: {
      fullName: 'Alex Rivera',
      firstName: 'Alex',
      firstLastName: 'Rivera',
      secondLastName: 'Soto',
      stageName: 'Flash',
    },
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
      channel: 'online',
      cash: { amountCents: 80000, receipt: 'A-17' },
      // A legacy participant has no name parts (#104).
      participant: {
        fullName: 'Alex Rivera',
        firstName: null,
        firstLastName: null,
        secondLastName: null,
        stageName: null,
      },
    };
    expect(
      readEntitlements(
        { registration: confirmed, passes: [], accessibleActivityIds: [] },
        registrationId,
      ),
    ).toEqual({ registration: confirmed, passes: [], accessibleActivityIds: [] });
  });

  it('reads the current cash payment, with a null receipt on a legacy confirmation (#104)', () => {
    const legacy = { ...registration, cash: { amountCents: 80000, receipt: null } };
    expect(readEntitlements({ ...entitlements, registration: legacy }, registrationId)).toEqual({
      ...entitlements,
      registration: legacy,
    });
    const extra = { ...registration, cash: { amountCents: 1, receipt: 'B-2', id: 'x' } };
    expect(
      readEntitlements({ ...entitlements, registration: extra }, registrationId)?.registration.cash,
    ).toEqual({ amountCents: 1, receipt: 'B-2' });
  });

  it('keeps only the name, its parts and the AKA of the participant', () => {
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
      { ...registration, channel: undefined },
      { ...registration, channel: 'phone' },
      { ...registration, cash: undefined },
      { ...registration, cash: 'A-17' },
      { ...registration, cash: { amountCents: 0, receipt: 'A-17' } },
      { ...registration, cash: { amountCents: 1.5, receipt: 'A-17' } },
      { ...registration, cash: { amountCents: 100, receipt: '' } },
      { ...registration, cash: { amountCents: 100 } },
      { ...registration, participant: null },
      { ...registration, participant: { ...registration.participant, fullName: '' } },
      { ...registration, participant: { fullName: 'Alex Rivera', stageName: null } },
      { ...registration, participant: { ...registration.participant, firstName: undefined } },
      { ...registration, participant: { ...registration.participant, firstLastName: 3 } },
      { ...registration, participant: { ...registration.participant, secondLastName: ' ' } },
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

  it('maps a rejected complimentary reason to the reason field', () => {
    expect(
      readRegistrationFailure(400, {
        message: 'Reason is required and must be 1 to 500 characters',
      }),
    ).toEqual({ kind: 'invalid', fieldErrors: { reason: 'invalid' } });
  });

  it('maps a rejected void reason to the reason field by its code (#104)', () => {
    expect(
      readRegistrationFailure(400, {
        message: 'A reason is required',
        code: 'void_reason_required',
      }),
    ).toEqual({ kind: 'invalid', fieldErrors: { reason: 'invalid' } });
  });

  it('maps a void of an online registration by its code (#104)', () => {
    expect(
      readRegistrationFailure(409, {
        message: 'Online registrations cannot be voided',
        code: 'online_registration_void_locked',
      }),
    ).toEqual({ kind: 'rule', code: 'online_registration_void_locked' });
  });

  it('maps the participant correction answers by their codes (#104)', () => {
    expect(
      readRegistrationFailure(400, {
        message: 'Reason is required and must be 1 to 500 characters',
        code: 'correction_reason_required',
      }),
    ).toEqual({ kind: 'invalid', fieldErrors: { reason: 'invalid' } });
    expect(
      readRegistrationFailure(400, {
        message: 'Invalid participant correction',
        fieldErrors: { firstName: 'required', stageName: 'too_long' },
      }),
    ).toEqual({ kind: 'invalid', fieldErrors: { firstName: 'required', stageName: 'too_long' } });
    expect(
      readRegistrationFailure(400, {
        message: 'The correction changes nothing',
        code: 'correction_no_changes',
      }),
    ).toEqual({ kind: 'rule', code: 'correction_no_changes' });
    expect(
      readRegistrationFailure(409, {
        message: 'Registration is voided',
        code: 'registration_voided',
      }),
    ).toEqual({ kind: 'rule', code: 'registration_voided' });
  });

  it('maps the cash correction answers by their codes (#104)', () => {
    expect(
      readRegistrationFailure(400, {
        message: 'Invalid cash correction',
        fieldErrors: { amountCents: 'invalid', receipt: 'too_long' },
      }),
    ).toEqual({ kind: 'invalid', fieldErrors: { amountCents: 'invalid', receipt: 'too_long' } });
    expect(
      readRegistrationFailure(400, {
        message: 'The original receipt must be checked',
        code: 'cash_receipt_check_required',
      }),
    ).toEqual({ kind: 'invalid', fieldErrors: { receiptChecked: 'required' } });
    expect(
      readRegistrationFailure(409, {
        message: 'Registration was not confirmed in cash',
        code: 'cash_correction_not_cash',
      }),
    ).toEqual({ kind: 'rule', code: 'cash_correction_not_cash' });
  });

  it('carries the other event count of a cross-event confirmation (#104)', () => {
    const conflict = {
      message: 'The participant is registered in other events',
      code: 'cross_event_confirmation_required',
    };
    expect(readRegistrationFailure(409, { ...conflict, otherEventCount: 2 })).toEqual({
      kind: 'cross_event',
      otherEventCount: 2,
    });
    // Without a readable positive count nothing could be confirmed knowingly.
    for (const otherEventCount of [undefined, 0, -1, 1.5, '2'])
      expect(readRegistrationFailure(409, { ...conflict, otherEventCount })).toEqual({
        kind: 'error',
      });
  });

  it('maps a confirmed selection change without reason to the reason field (#170)', () => {
    expect(
      readRegistrationFailure(400, {
        message: 'Reason is required and must be 1 to 500 characters',
        code: 'selection_change_reason_required',
      }),
    ).toEqual({ kind: 'invalid', fieldErrors: { reason: 'invalid' } });
    // The code is the contract, so a reworded message still reaches the field.
    expect(
      readRegistrationFailure(400, {
        message: 'A reason is required',
        code: 'selection_change_reason_required',
      }),
    ).toEqual({ kind: 'invalid', fieldErrors: { reason: 'invalid' } });
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
      [409, 'Online registrations cannot lose a pass', 'online_registration_pass_locked'],
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

  it('maps the complimentary confirmation conflicts by their codes', () => {
    expect(
      readRegistrationFailure(409, { message: 'Registration holds no passes', code: 'no_passes' }),
    ).toEqual({ kind: 'rule', code: 'no_passes' });
    expect(
      readRegistrationFailure(409, {
        message: 'Registration passes do not total zero',
        code: 'not_zero_total',
      }),
    ).toEqual({ kind: 'rule', code: 'not_zero_total' });
  });

  it('maps a pass an add-on requires by its code, whatever add-on the message names', () => {
    expect(
      readRegistrationFailure(409, {
        message: 'Remove «Open Styles», «Top Rock» first; they require this pass',
        code: 'pass_required_by_add_on',
      }),
    ).toEqual({ kind: 'rule', code: 'pass_required_by_add_on' });
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
