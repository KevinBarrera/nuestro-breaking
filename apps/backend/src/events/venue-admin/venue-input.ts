import { hasControlCharacters } from '@/identity-access/password-policy';
import type { ParseResult } from '@/events/admin-events/admin-event-input';

// Pure input parsing for an event's venues from the admin panel (#213 T11, D8). A venue only has a
// name today, so creating and editing take the same single field.

export type VenueInput = { name: string };

const MAX_NAME = 120;
const FIELDS = new Set(['name']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A trimmed, non-blank name of at most 120 characters without control characters. Non-blank also
 * satisfies the `venues_name_ck` check.
 */
function parseName(raw: unknown): string | null {
  if (typeof raw !== 'string' || hasControlCharacters(raw)) return null;
  const name = raw.trim();
  return name && name.length <= MAX_NAME ? name : null;
}

/**
 * Validates a venue body: `{ name }` is required and any other key is `invalid`. A body that is not
 * an object is `{ body: "invalid" }`; an empty one names `emptyError`: `body` for an edit with nothing
 * to change, `name` for a creation missing its name.
 * Errors name fields only and never echo the submitted values.
 */
function parseVenue(body: unknown, emptyError: 'body' | 'name'): ParseResult<VenueInput> {
  if (!isRecord(body)) return { ok: false, fieldErrors: { body: 'invalid' } };
  if (Object.keys(body).length === 0)
    return { ok: false, fieldErrors: { [emptyError]: 'invalid' } };

  const fieldErrors: Record<string, 'invalid'> = {};
  for (const key of Object.keys(body)) if (!FIELDS.has(key)) fieldErrors[key] = 'invalid';
  const name = parseName(body.name);
  if (!name) fieldErrors.name = 'invalid';

  if (!name || Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, value: { name } };
}

/** A new venue: `{ name }`. */
export function parseCreateVenueInput(body: unknown): ParseResult<VenueInput> {
  return parseVenue(body, 'name');
}

/** An edit: `{ name }`, the only editable field; an empty body is `{ body: "invalid" }`. */
export function parseUpdateVenueInput(body: unknown): ParseResult<VenueInput> {
  return parseVenue(body, 'body');
}
