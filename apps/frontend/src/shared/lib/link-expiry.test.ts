import { describe, expect, it } from 'vitest';
import { formatLinkExpiry } from './link-expiry';

describe('formatLinkExpiry', () => {
  it('formats the expiry in Spanish in the given time zone', () => {
    expect(formatLinkExpiry('2026-10-15T00:20:00.000Z', 'America/Mexico_City')).toBe(
      '14 de octubre de 2026, 18:20',
    );
    expect(formatLinkExpiry('2026-10-15T00:20:00.000Z', 'UTC')).toBe(
      '15 de octubre de 2026, 00:20',
    );
  });
});
