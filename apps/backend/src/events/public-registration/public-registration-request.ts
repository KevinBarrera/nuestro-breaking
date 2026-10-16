import {
  normalizeEmail,
  normalizeInstagram,
  normalizePhone,
} from '@/events/participant-profile/participant-normalization';
import {
  LEGAL_DOCUMENT_KEYS,
  LEGAL_DOCUMENT_VERSIONS,
  type LegalAcceptance,
} from '@/events/legal-documents';
import type {
  FieldErrorCode,
  PublicRegistrationBuyer,
  PublicRegistrationRequest,
} from './public-registration.types';

export type ParseResult =
  | { ok: true; value: PublicRegistrationRequest }
  | { ok: false; fieldErrors: Record<string, FieldErrorCode> };

// Bounds follow the participant checks of migration 0015 (names and city 100, Instagram 64,
// level 50); the others are conservative limits for a public form.
const MAX = {
  name: 100,
  stageName: 100,
  email: 254,
  phone: 30,
  city: 100,
  instagram: 64,
  level: 50,
};
const MAX_PASSES = 10;
const MAX_SELECTIONS = 20;
const PHONE_DIGITS = { min: 10, max: 15 };
const MIN_BIRTH_DATE = '1900-01-01';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Pragmatic shape check: one @, no spaces, a dot in the domain. Delivery proves the rest.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const BODY_KEYS = new Set(['buyer', 'passes', 'legalAcceptances']);
const LEGAL_KEYS = new Set<string>(LEGAL_DOCUMENT_KEYS);
const BUYER_KEYS = new Set([
  'firstName',
  'firstLastName',
  'secondLastName',
  'stageName',
  'email',
  'phone',
  'city',
  'instagram',
  'level',
  'birthDate',
]);
const PASS_KEYS = new Set(['passTypeId', 'selectedActivityIds']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// A real calendar date: `2001-02-29` and `2000-13-01` are rejected.
function isCalendarDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** The #58 participant fields, shared by public registration and admin manual registration. */
export const PARTICIPANT_FIELD_KEYS: ReadonlySet<string> = BUYER_KEYS;

/**
 * Validates and normalizes the #58 participant fields of `source` (#174, #125). Pure: `today`
 * (`YYYY-MM-DD`) is the latest accepted birth date. Problems are written to `errors` under
 * `prefix` + field name; unknown keys are the caller's concern. Returns null when any field fails.
 */
export function parseParticipantFields(
  source: Record<string, unknown>,
  today: string,
  prefix: string,
  errors: Record<string, FieldErrorCode>,
): PublicRegistrationBuyer | null {
  const fail = (path: string, code: FieldErrorCode) => {
    errors[path] = code;
    return null;
  };
  let valid = true;
  const reject = (key: string, code: FieldErrorCode) => {
    valid = false;
    return fail(`${prefix}${key}`, code);
  };
  // Required text: trimmed, non-blank, bounded. Optional text: absent, null or blank means none.
  const text = (key: string, max: number, required: boolean): string | null => {
    const value = source[key];
    if (value === undefined || value === null) return required ? reject(key, 'required') : null;
    if (typeof value !== 'string') return reject(key, 'invalid');
    const trimmed = value.trim();
    if (!trimmed) return required ? reject(key, 'required') : null;
    if (trimmed.length > max) return reject(key, 'too_long');
    return trimmed;
  };

  const firstName = text('firstName', MAX.name, true);
  const firstLastName = text('firstLastName', MAX.name, true);
  const secondLastName = text('secondLastName', MAX.name, false);
  const stageName = text('stageName', MAX.stageName, false);
  let email = text('email', MAX.email, true);
  if (email !== null)
    email = EMAIL.test(email) ? normalizeEmail(email) : reject('email', 'invalid');
  let phone = text('phone', MAX.phone, true);
  if (phone !== null) {
    const digits = normalizePhone(phone).length;
    if (digits < PHONE_DIGITS.min || digits > PHONE_DIGITS.max) phone = reject('phone', 'invalid');
  }
  const city = text('city', MAX.city, false);
  let instagram = text('instagram', MAX.instagram, false);
  if (instagram !== null) {
    const handle = normalizeInstagram(instagram);
    instagram = handle && !/\s/.test(handle) ? handle : reject('instagram', 'invalid');
  }
  const level = text('level', MAX.level, false);
  // A long value is simply not a date, so the length bound never reports `too_long` here.
  let birthDate = text('birthDate', 100, false);
  if (birthDate !== null && (!isCalendarDate(birthDate) || birthDate < MIN_BIRTH_DATE))
    birthDate = reject('birthDate', 'invalid');
  else if (birthDate !== null && birthDate > today) birthDate = reject('birthDate', 'in_future');
  if (!valid || !firstName || !firstLastName || !email || !phone) return null;
  return {
    firstName,
    firstLastName,
    secondLastName,
    stageName,
    email,
    phone,
    city,
    instagram,
    level,
    birthDate,
  };
}

/**
 * Validates and normalizes the public registration body (#174). Pure: `today` (`YYYY-MM-DD`) is
 * the latest accepted birth date. Every problem is reported by field path with a stable code, so
 * the purchase screens (#176) can show Spanish messages next to each field. The buyer must accept
 * the current version of the three legal documents (#180).
 */
export function parsePublicRegistrationRequest(body: unknown, today: string): ParseResult {
  if (!isRecord(body)) return { ok: false, fieldErrors: { body: 'invalid' } };
  const errors: Record<string, FieldErrorCode> = {};
  const fail = (path: string, code: FieldErrorCode) => {
    errors[path] = code;
    return null;
  };
  const unknownKeys = (value: Record<string, unknown>, allowed: Set<string>, prefix: string) => {
    for (const key of Object.keys(value))
      if (!allowed.has(key)) fail(`${prefix}${key}`, 'unknown_field');
  };
  unknownKeys(body, BODY_KEYS, '');

  // Optional activity ids for one pass: unique UUIDs, at most `MAX_SELECTIONS`.
  const selections = (value: unknown, path: string): string[] | null => {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) return fail(path, 'invalid');
    if (value.length > MAX_SELECTIONS) return fail(path, 'too_many');
    const ids: string[] = [];
    let valid = true;
    value.forEach((id: unknown, index) => {
      if (typeof id !== 'string' || !UUID.test(id)) {
        fail(`${path}[${index}]`, 'invalid');
        valid = false;
      } else if (ids.includes(id.toLowerCase())) {
        fail(`${path}[${index}]`, 'duplicate');
        valid = false;
      } else ids.push(id.toLowerCase());
    });
    return valid ? ids : null;
  };

  let buyer: PublicRegistrationBuyer | null = null;
  if (body.buyer === undefined || body.buyer === null) fail('buyer', 'required');
  else if (!isRecord(body.buyer)) fail('buyer', 'invalid');
  else {
    unknownKeys(body.buyer, BUYER_KEYS, 'buyer.');
    buyer = parseParticipantFields(body.buyer, today, 'buyer.', errors);
  }

  const passes: PublicRegistrationRequest['passes'] = [];
  if (body.passes === undefined || body.passes === null) fail('passes', 'required');
  else if (!Array.isArray(body.passes)) fail('passes', 'invalid');
  else if (body.passes.length === 0) fail('passes', 'required');
  else if (body.passes.length > MAX_PASSES) fail('passes', 'too_many');
  else {
    const seenPassTypes = new Set<string>();
    body.passes.forEach((pass: unknown, index) => {
      const path = `passes[${index}]`;
      if (!isRecord(pass)) return fail(path, 'invalid');
      unknownKeys(pass, PASS_KEYS, `${path}.`);
      let passTypeId: string | null = null;
      if (pass.passTypeId === undefined || pass.passTypeId === null || pass.passTypeId === '')
        fail(`${path}.passTypeId`, 'required');
      else if (typeof pass.passTypeId !== 'string' || !UUID.test(pass.passTypeId))
        fail(`${path}.passTypeId`, 'invalid');
      else if (seenPassTypes.has(pass.passTypeId.toLowerCase()))
        fail(`${path}.passTypeId`, 'duplicate');
      else {
        passTypeId = pass.passTypeId.toLowerCase();
        seenPassTypes.add(passTypeId);
      }
      const selectedActivityIds = selections(
        pass.selectedActivityIds,
        `${path}.selectedActivityIds`,
      );
      if (passTypeId && selectedActivityIds) passes.push({ passTypeId, selectedActivityIds });
    });
  }

  // The version of each document the buyer accepted (#180): a version other than the current one
  // means the buyer read an older text, so they must reload and accept it again.
  const legalAcceptances: LegalAcceptance[] = [];
  const acceptances = body.legalAcceptances;
  if (acceptances === undefined || acceptances === null) fail('legalAcceptances', 'required');
  else if (!isRecord(acceptances)) fail('legalAcceptances', 'invalid');
  else {
    unknownKeys(acceptances, LEGAL_KEYS, 'legalAcceptances.');
    for (const document of LEGAL_DOCUMENT_KEYS) {
      const path = `legalAcceptances.${document}`;
      const version = acceptances[document];
      if (version === undefined || version === null || version === '') fail(path, 'required');
      else if (typeof version !== 'string') fail(path, 'invalid');
      else if (version !== LEGAL_DOCUMENT_VERSIONS[document]) fail(path, 'outdated');
      else legalAcceptances.push({ document, version });
    }
  }

  if (Object.keys(errors).length > 0 || !buyer) return { ok: false, fieldErrors: errors };
  return { ok: true, value: { buyer, passes, legalAcceptances } };
}
