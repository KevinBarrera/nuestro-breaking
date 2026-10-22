import {
  heldPassClasses,
  registrationChannels,
  registrationStatuses,
  type AdminRegistrationFailure,
  type AdminRegistrationRuleCode,
  type CashConfirmation,
  type CashPayment,
  type HeldPass,
  type ManualRegistration,
  type PossibleDuplicate,
  type RegistrationEntitlements,
  type RegistrationSearchPage,
  type RegistrationSearchResult,
  type RegistrationSummary,
} from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isTextOrNull = (value: unknown): value is string | null => value === null || isText(value);

const isInstantOrNull = (value: unknown): value is string | null =>
  value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));

const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  values.some((known) => known === value);

// Registration and pass ids become route segments, so only UUIDs are accepted.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isId = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);

// Reads every entry or none, so the screen never shows a partial list.
function every<T>(value: unknown, read: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const entries = value.map(read);
  return entries.every((entry) => entry !== null) ? entries : null;
}

function readActivity(value: unknown): RegistrationSearchResult['activities'][number] | null {
  if (!isRecord(value)) return null;
  const { id, name, kind, checkedInAt } = value;
  if (!isText(id) || !isText(name) || !isText(kind) || !isInstantOrNull(checkedInAt)) return null;
  return { id, name, kind, checkedInAt };
}

function readSearchResult(value: unknown, eventId: string): RegistrationSearchResult | null {
  if (!isRecord(value) || !isRecord(value.participant) || !isRecord(value.registration))
    return null;
  const { id: participantId, fullName, email, stageName } = value.participant;
  if (!isText(participantId) || !isText(fullName)) return null;
  if (!isTextOrNull(email) || !isTextOrNull(stageName)) return null;
  const { id, folio, status, checkedInAt } = value.registration;
  if (!isId(id) || value.registration.eventId !== eventId || !isTextOrNull(folio)) return null;
  if (!oneOf(registrationStatuses, status) || !isInstantOrNull(checkedInAt)) return null;
  const activities = every(value.activities, readActivity);
  if (!activities) return null;
  return {
    participant: { id: participantId, fullName, email, stageName },
    registration: { id, eventId, folio, status, checkedInAt },
    activities,
  };
}

export function readSearchPage(value: unknown, eventId: string): RegistrationSearchPage | null {
  if (!isRecord(value)) return null;
  const { total, limit, offset } = value;
  if (!isCount(total) || !isCount(limit) || !isCount(offset)) return null;
  const results = every(value.results, (entry) => readSearchResult(entry, eventId));
  return results && { total, limit, offset, results };
}

export function readManualRegistration(value: unknown, eventId: string): ManualRegistration | null {
  if (!isRecord(value)) return null;
  const { registrationId, participantId, status, auditId } = value;
  if (!isId(registrationId) || !isText(participantId) || !isText(auditId)) return null;
  if (value.eventId !== eventId || status !== 'pending_payment') return null;
  return { registrationId, participantId, eventId, status, auditId };
}

// The answer of a cash or complimentary confirmation, which share their shape.
export function readConfirmation(
  value: unknown,
  eventId: string,
  registrationId: string,
): CashConfirmation | null {
  if (!isRecord(value)) return null;
  const { folio, auditId } = value;
  if (value.registrationId !== registrationId || value.eventId !== eventId) return null;
  if (value.status !== 'confirmed' || !isText(folio) || !isText(auditId)) return null;
  return { registrationId, eventId, status: 'confirmed', folio, auditId };
}

function readHeldPass(value: unknown): HeldPass | null {
  if (!isRecord(value)) return null;
  const { registrationPassId, passTypeId, name, passClass, priceCents } = value;
  if (!isId(registrationPassId) || !isId(passTypeId) || !isText(name)) return null;
  if (!oneOf(heldPassClasses, passClass) || !isCount(priceCents)) return null;
  const selections = every(value.selections, (id) => (isText(id) ? id : null));
  return selections && { registrationPassId, passTypeId, name, passClass, priceCents, selections };
}

// The current cash payment, or null; `undefined` (a missing field) is malformed.
function readCash(value: unknown): CashPayment | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const { amountCents, receipt } = value;
  if (!isCount(amountCents) || amountCents === 0 || !isTextOrNull(receipt)) return undefined;
  return { amountCents, receipt };
}

// Keeps only the participant's name, its parts and the AKA, even if the answer carries more.
function readSummary(value: unknown, registrationId: string): RegistrationSummary | null {
  if (!isRecord(value) || value.id !== registrationId || !isRecord(value.participant)) return null;
  const { status, folio, channel } = value;
  const { fullName, firstName, firstLastName, secondLastName, stageName } = value.participant;
  if (!oneOf(registrationStatuses, status) || !isTextOrNull(folio)) return null;
  if (!oneOf(registrationChannels, channel)) return null;
  const cash = readCash(value.cash);
  if (cash === undefined) return null;
  if (!isText(fullName) || !isTextOrNull(stageName)) return null;
  if (!isTextOrNull(firstName) || !isTextOrNull(firstLastName) || !isTextOrNull(secondLastName))
    return null;
  return {
    id: registrationId,
    status,
    folio,
    channel,
    cash,
    participant: { fullName, firstName, firstLastName, secondLastName, stageName },
  };
}

export function readEntitlements(
  value: unknown,
  registrationId: string,
): RegistrationEntitlements | null {
  if (!isRecord(value)) return null;
  const registration = readSummary(value.registration, registrationId);
  const passes = every(value.passes, readHeldPass);
  const accessibleActivityIds = every(value.accessibleActivityIds, (id) =>
    isText(id) ? id : null,
  );
  return registration && passes && accessibleActivityIds
    ? { registration, passes, accessibleActivityIds }
    : null;
}

function readPossibleDuplicate(value: unknown): PossibleDuplicate | null {
  if (!isRecord(value)) return null;
  const { registrationId, fullName, stageName, folio, status, maskedEmail, maskedPhone } = value;
  if (!isId(registrationId) || !isText(fullName) || !isTextOrNull(stageName)) return null;
  if (!isTextOrNull(folio) || (status !== 'pending_payment' && status !== 'confirmed')) return null;
  if (!isTextOrNull(maskedEmail) || !isTextOrNull(maskedPhone)) return null;
  return { registrationId, fullName, stageName, folio, status, maskedEmail, maskedPhone };
}

// Rule answers that carry only a message; the message text is the backend's stable contract.
const ruleMessages: Record<string, AdminRegistrationRuleCode> = {
  'Registration is not pending payment': 'registration_not_pending',
  'Registration is not pending in this event': 'registration_not_pending',
  'Registration is voided': 'registration_voided',
  'Pass type is archived': 'pass_type_archived',
  'Registration already holds this pass type': 'pass_already_held',
  'A full pass already includes general entry': 'full_includes_general',
  'Add-on requires a full pass': 'add_on_requires_full',
  'Add-on requires a general pass': 'add_on_requires_general',
  'Invalid activity selection': 'invalid_activity_selection',
  'Online registrations cannot lose a pass': 'online_registration_pass_locked',
};

// Reason rejections that carry a stable backend `code`: the confirmed selection change (#170), the
// void and the participant correction (#104).
const reasonCodes = [
  'selection_change_reason_required',
  'void_reason_required',
  'correction_reason_required',
];

// Field rejections that carry a stable backend `code`: the unchecked original receipt of a cash
// correction (#104).
const fieldCodes: Record<string, Record<string, string>> = {
  cash_receipt_check_required: { receiptChecked: 'required' },
};

// 400 rule answers that carry a stable backend `code`.
const badRequestRuleCodes: readonly AdminRegistrationRuleCode[] = [
  'correction_no_changes',
  'discipline_swap_invalid_target',
];

// Cash and complimentary confirmation and the selection change reason (#170) report their invalid
// fields only by message; they map to the input names.
const fieldMessages: Record<string, Record<string, string>> = {
  'Invalid amount in cents': { amountCents: 'invalid' },
  'Receipt number is required and must be 1 to 50 characters': { receipt: 'invalid' },
  'Reason is required and must be 1 to 500 characters': { reason: 'invalid' },
};

// 409 answers that carry a stable backend `code`.
const ruleCodes: readonly AdminRegistrationRuleCode[] = [
  'receipt_taken',
  'no_passes',
  'not_zero_total',
  'pass_required_by_add_on',
  'online_registration_void_locked',
  'discipline_swap_single_full_pass_required',
  'discipline_swap_checked_in',
  'discipline_swap_price_mismatch',
  'cash_correction_not_cash',
];

const messageOf = (body: unknown) =>
  isRecord(body) && typeof body.message === 'string' ? body.message : '';

// Maps a failed response to what the screens need: only known codes, messages and field error
// codes pass through; anything else is a generic error.
export function readRegistrationFailure(status: number, body: unknown): AdminRegistrationFailure {
  if (status === 401) return { kind: 'unauthorized' };
  if (status === 403) return { kind: 'forbidden' };
  if (status === 404) return { kind: 'not_found' };
  const message = messageOf(body);
  const ruleCode = Object.hasOwn(ruleMessages, message) ? ruleMessages[message] : undefined;
  if ((status === 400 || status === 409) && ruleCode) return { kind: 'rule', code: ruleCode };
  if (status === 400) {
    if (isRecord(body) && reasonCodes.some((code) => code === body.code))
      return { kind: 'invalid', fieldErrors: { reason: 'invalid' } };
    if (isRecord(body) && typeof body.code === 'string' && Object.hasOwn(fieldCodes, body.code))
      return { kind: 'invalid', fieldErrors: fieldCodes[body.code] };
    const code = isRecord(body) ? badRequestRuleCodes.find((known) => known === body.code) : null;
    if (code) return { kind: 'rule', code };
    if (Object.hasOwn(fieldMessages, message))
      return { kind: 'invalid', fieldErrors: fieldMessages[message] };
    const raw = isRecord(body) && isRecord(body.fieldErrors) ? body.fieldErrors : {};
    const fieldErrors = Object.fromEntries(
      Object.entries(raw).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
    return { kind: 'invalid', fieldErrors };
  }
  if (status === 409 && isRecord(body)) {
    const code = ruleCodes.find((known) => known === body.code);
    if (code) return { kind: 'rule', code };
    // Every match must be readable, so no registration is confirmed without being shown.
    if (body.code === 'possible_duplicates') {
      const matches = every(body.matches, readPossibleDuplicate);
      if (matches && matches.length > 0) return { kind: 'possible_duplicates', matches };
    }
    // Without a readable count the other events could not be confirmed knowingly.
    const { otherEventCount } = body;
    if (
      body.code === 'cross_event_confirmation_required' &&
      isCount(otherEventCount) &&
      otherEventCount > 0
    )
      return { kind: 'cross_event', otherEventCount };
  }
  return { kind: 'error' };
}
