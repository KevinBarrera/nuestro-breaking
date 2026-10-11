import type { TeamMember } from '@/entities/admin-team';
import { describe, expect, it } from 'vitest';
import { accessSummary, expiryHint, memberActions, memberStatus } from './team-model';

const now = new Date('2026-10-11T12:00:00.000Z');

const member = (overrides: Partial<TeamMember> = {}): TeamMember => ({
  id: 'u1',
  displayName: 'Ana',
  email: 'ana@example.org',
  status: 'active',
  access: { kind: 'global' },
  invitation: null,
  ...overrides,
});

describe('accessSummary', () => {
  it('names all events or the chosen events', () => {
    expect(accessSummary({ kind: 'global' })).toBe('Todos los eventos');
    expect(
      accessSummary({
        kind: 'events',
        events: [
          { id: 'a', name: 'Preliminares' },
          { id: 'b', name: 'Final' },
        ],
      }),
    ).toBe('Preliminares, Final');
    expect(accessSummary({ kind: 'events', events: [] })).toBe('Sin eventos');
  });
});

describe('expiryHint', () => {
  it('counts whole days, then hours, then under an hour', () => {
    expect(expiryHint('2026-10-14T12:00:00.000Z', now)).toBe('Vence en 3 días');
    expect(expiryHint('2026-10-12T13:00:00.000Z', now)).toBe('Vence en 1 día');
    expect(expiryHint('2026-10-12T11:00:00.000Z', now)).toBe('Vence en 23 horas');
    expect(expiryHint('2026-10-11T13:00:00.000Z', now)).toBe('Vence en 1 hora');
    expect(expiryHint('2026-10-11T12:30:00.000Z', now)).toBe('Vence en menos de 1 hora');
  });
});

describe('memberStatus', () => {
  it('labels each status, including expired and missing links', () => {
    expect(memberStatus(member(), now)).toEqual({ label: 'Activo', tone: 'success' });
    expect(memberStatus(member({ status: 'deactivated' }), now)).toEqual({
      label: 'Desactivado',
      tone: 'neutral',
    });
    expect(
      memberStatus(
        member({
          status: 'pending',
          invitation: { expiresAt: '2026-10-13T12:00:00.000Z', expired: false },
        }),
        now,
      ),
    ).toEqual({ label: 'Invitación pendiente', tone: 'warning', hint: 'Vence en 2 días' });
    expect(
      memberStatus(
        member({
          status: 'pending',
          invitation: { expiresAt: '2026-10-10T12:00:00.000Z', expired: true },
        }),
        now,
      ),
    ).toEqual({ label: 'Invitación vencida', tone: 'warning', hint: 'Genera un enlace nuevo' });
    expect(memberStatus(member({ status: 'pending' }), now)).toEqual({
      label: 'Invitación cancelada',
      tone: 'warning',
      hint: 'Genera un enlace nuevo',
    });
  });
});

describe('memberActions', () => {
  it('offers the actions each status allows', () => {
    expect(memberActions(member(), false)).toEqual(['regenerate', 'change-access', 'deactivate']);
    expect(
      memberActions(
        member({
          status: 'pending',
          invitation: { expiresAt: '2026-10-13T12:00:00.000Z', expired: false },
        }),
        false,
      ),
    ).toEqual(['regenerate', 'cancel-invitation', 'change-access', 'deactivate']);
    expect(memberActions(member({ status: 'pending' }), false)).toEqual([
      'regenerate',
      'change-access',
      'deactivate',
    ]);
    expect(memberActions(member({ status: 'deactivated' }), false)).toEqual([
      'reactivate',
      'change-access',
    ]);
  });

  it('only lets a person regenerate their own link', () => {
    expect(memberActions(member(), true)).toEqual(['regenerate']);
  });
});
