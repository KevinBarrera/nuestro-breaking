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
    expect(accessSummary({ kind: 'none' })).toBe('Sin acceso');
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
    expect(memberStatus(member({ status: 'no_access', access: { kind: 'none' } }), now)).toEqual({
      label: 'Sin acceso',
      tone: 'neutral',
      hint: 'Usa «Cambiar acceso» para darle eventos',
    });
  });
});

describe('memberActions', () => {
  it('offers the actions each status allows', () => {
    expect(memberActions(member(), false, now)).toEqual([
      'regenerate',
      'change-access',
      'deactivate',
    ]);
    expect(
      memberActions(
        member({
          status: 'pending',
          invitation: { expiresAt: '2026-10-13T12:00:00.000Z', expired: false },
        }),
        false,
        now,
      ),
    ).toEqual(['regenerate', 'cancel-invitation', 'change-access', 'deactivate']);
    expect(memberActions(member({ status: 'pending' }), false, now)).toEqual([
      'regenerate',
      'change-access',
      'deactivate',
    ]);
    expect(memberActions(member({ status: 'deactivated' }), false, now)).toEqual([
      'reactivate',
      'change-access',
    ]);
  });

  it('offers access back, but no new link, to a member without access (#213 D9)', () => {
    const none = member({ status: 'no_access', access: { kind: 'none' } });
    expect(memberActions(none, false, now)).toEqual(['change-access', 'deactivate']);
    expect(
      memberActions(
        { ...none, invitation: { expiresAt: '2026-10-13T12:00:00.000Z', expired: false } },
        false,
        now,
      ),
    ).toEqual(['cancel-invitation', 'change-access', 'deactivate']);
    expect(memberActions(none, true, now)).toEqual([]);
  });

  it("offers no actions on the person's own row (D9)", () => {
    expect(memberActions(member(), true, now)).toEqual([]);
    expect(memberActions(member({ status: 'pending' }), true, now)).toEqual([]);
    expect(memberActions(member({ status: 'deactivated' }), true, now)).toEqual([]);
  });
});

describe('status and actions agree on an expired link', () => {
  const pending = (expiresAt: string, expired: boolean) =>
    member({ status: 'pending', invitation: { expiresAt, expired } });
  const cases = [
    // At the expiry instant the link no longer works, even before the backend flag flips.
    { link: pending(now.toISOString(), false), open: false },
    { link: pending('2026-10-11T12:00:00.001Z', false), open: true },
    // The backend flag wins when it says expired, whatever the clock.
    { link: pending('2026-10-12T12:00:00.000Z', true), open: false },
  ];

  it('shows a pending link only while it can be cancelled', () => {
    for (const { link, open } of cases) {
      expect(memberStatus(link, now).label).toBe(
        open ? 'Invitación pendiente' : 'Invitación vencida',
      );
      expect(memberActions(link, false, now).includes('cancel-invitation')).toBe(open);
    }
  });
});
