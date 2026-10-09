import {
  normalizeEmail,
  normalizeInstagram,
  normalizePhone,
} from '@/events/participant-profile/participant-normalization';
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

const BODY_KEYS = new Set(['buyer', 'passes']);
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

/**
 * Validates and normalizes the public registration body (#174). Pure: `today` (`YYYY-MM-DD`) is
 * the latest accepted birth date. Every problem is reported by field path with a stable code, so
 * the purchase screens (#176) can show Spanish messages next to each field.
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

  // Required text: trimmed, non-blank, bounded. Optional text: absent, null or blank means none.
  const text = (
    source: Record<string, unknown>,
    key: string,
    max: number,
    required: boolean,
  ): string | null => {
    const path = `buyer.${key}`;
    const value = source[key];
    if (value === undefined || value === null) return required ? fail(path, 'required') : null;
    if (typeof value !== 'string') return fail(path, 'invalid');
    const trimmed = value.trim();
    if (!trimmed) return required ? fail(path, 'required') : null;
    if (trimmed.length > max) return fail(path, 'too_long');
    return trimmed;
  };

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
    const source = body.buyer;
    unknownKeys(source, BUYER_KEYS, 'buyer.');
    const firstName = text(source, 'firstName', MAX.name, true);
    const firstLastName = text(source, 'firstLastName', MAX.name, true);
    const secondLastName = text(source, 'secondLastName', MAX.name, false);
    const stageName = text(source, 'stageName', MAX.stageName, false);
    let email = text(source, 'email', MAX.email, true);
    if (email !== null)
      email = EMAIL.test(email) ? normalizeEmail(email) : fail('buyer.email', 'invalid');
    let phone = text(source, 'phone', MAX.phone, true);
    if (phone !== null) {
      const digits = normalizePhone(phone).length;
      if (digits < PHONE_DIGITS.min || digits > PHONE_DIGITS.max)
        phone = fail('buyer.phone', 'invalid');
    }
    const city = text(source, 'city', MAX.city, false);
    let instagram = text(source, 'instagram', MAX.instagram, false);
    if (instagram !== null) {
      const handle = normalizeInstagram(instagram);
      instagram = handle && !/\s/.test(handle) ? handle : fail('buyer.instagram', 'invalid');
    }
    const level = text(source, 'level', MAX.level, false);
    // A long value is simply not a date, so the length bound never reports `too_long` here.
    let birthDate = text(source, 'birthDate', 100, false);
    if (birthDate !== null && (!isCalendarDate(birthDate) || birthDate < MIN_BIRTH_DATE))
      birthDate = fail('buyer.birthDate', 'invalid');
    else if (birthDate !== null && birthDate > today)
      birthDate = fail('buyer.birthDate', 'in_future');
    if (firstName && firstLastName && email && phone)
      buyer = {
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

  if (Object.keys(errors).length > 0 || !buyer) return { ok: false, fieldErrors: errors };
  return { ok: true, value: { buyer, passes } };
}
