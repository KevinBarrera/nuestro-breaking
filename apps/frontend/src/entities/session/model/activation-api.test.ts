import { describe, expect, it } from 'vitest';
import { readActivationDetails, readActivationFailure } from './activation-api';

describe('readActivationFailure', () => {
  it('maps the 410 invalid link and the weak password rules', () => {
    expect(readActivationFailure(410, { code: 'invalid_link' })).toEqual({ kind: 'invalid-link' });
    expect(readActivationFailure(400, { failedRules: ['symbol', 3] })).toEqual({
      kind: 'weak-password',
      failedRules: ['symbol'],
    });
  });

  it('treats anything else as a generic error', () => {
    expect(readActivationFailure(400, { message: 'Invalid request' })).toEqual({ kind: 'error' });
    expect(readActivationFailure(403, null)).toEqual({ kind: 'error' });
    expect(readActivationFailure(500, null)).toEqual({ kind: 'error' });
  });
});

describe('readActivationDetails', () => {
  it('keeps only the checked fields', () => {
    expect(
      readActivationDetails({
        displayName: 'Ana',
        email: 'ana@example.org',
        expiresAt: '2026-10-14T18:20:00.000Z',
        extra: true,
      }),
    ).toEqual({
      displayName: 'Ana',
      email: 'ana@example.org',
      expiresAt: '2026-10-14T18:20:00.000Z',
    });
    expect(readActivationDetails({ displayName: 'Ana', email: 'ana@example.org' })).toBeNull();
  });
});
